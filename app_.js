import * as THREE from 'https://unpkg.com/three@0.126.1/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.126.1/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'https://unpkg.com/three@0.126.1/examples/jsm/controls/TransformControls.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.126.1/examples/jsm/loaders/GLTFLoader.js';
import * as CANNON from 'https://unpkg.com/cannon-es@0.20.0/dist/cannon-es.js';

let jsonModel;
let scene, camera, renderer, controls, transformControls;
let world; // CANNON.js world
let meshes = [], bodies = []; // 存储所有的网格和物理体
let selectedObject = null;
let dimensionsPanel;
let isDragging = false;
let selectedFace = null;
let selectedFaces = [];
let isMovingFace = false;
let isFaceSelectionMode = false;
let selectionBox = null;
let mouseStartPosition = new THREE.Vector2();
let mouseEndPosition = new THREE.Vector2();
let snapPoints = [];
let isSnapping = false;
let snapDistance = 100; // 吸附距离
let isSelecting = false;
let undoStack = [];
let redoStack = [];
const MAX_HISTORY = 50;  // 最大历史记录数
let isTransforming = false;
let lastSavedState = null;
let renderManager; // Make renderManager accessible globally

// 场景环境管理器类
class SceneEnvironment {
    constructor(scene) {
        this.scene = scene;
        this.currentEnvironment = null;
        this.environmentObjects = new Map();
        this.createFallbackEnvironment(); // 直接创建后备环境，不尝试加载模型
    }
    
    async loadEnvironmentAssets() {
        try {
            const loader = new GLTFLoader();
            
            // 由于模型文件可能不存在，我们暂时不加载它们
            console.log('GLTF model loading skipped - using fallback environments');
            this.createFallbackEnvironment();
            
        } catch (error) {
            console.warn('无法加载环境模型:', error);
            this.createFallbackEnvironment();
        }
    }
    
    processEnvironmentModel(model, type) {
        const group = new THREE.Group();
        
        model.scene.traverse((object) => {
            if (object.isMesh) {
                // 设置阴影
                object.castShadow = true;
                object.receiveShadow = true;
                
                // 根据环境类型调整材质
                if (object.material) {
                    object.material = new THREE.MeshStandardMaterial({
                        map: object.material.map,
                        normalMap: object.material.normalMap,
                        roughnessMap: object.material.roughnessMap,
                        metalnessMap: object.material.metalnessMap,
                        envMapIntensity: 1,
                        roughness: 0.7,
                        metalness: 0.3
                    });
                }
            }
        });
        
        group.add(model.scene);
        group.scale.set(100, 100, 100);
        group.position.y = -1000;
        
        return group;
    }
    
    createFallbackEnvironment() {
        const environments = {
            'city': { color: 0x808080, roughness: 0.8, metalness: 0.2 },
            'rural': { color: 0x8B4513, roughness: 0.9, metalness: 0.1 },
            'mountain': { color: 0x696969, roughness: 0.85, metalness: 0.15 },
            'grassland': { color: 0x90EE90, roughness: 0.9, metalness: 0.1 },
            'beach': { color: 0xF4A460, roughness: 0.7, metalness: 0.1 },
            'rainforest': { color: 0x228B22, roughness: 0.8, metalness: 0.2 },
            'forest': { color: 0x228B22, roughness: 0.85, metalness: 0.15 },
            'desert': { color: 0xDEB887, roughness: 0.6, metalness: 0.1 },
            'snow': { color: 0xFFFFFF, roughness: 0.3, metalness: 0.2 }
        };
        
        for (const [type, props] of Object.entries(environments)) {
            const group = new THREE.Group();
            
            // 创建地面
            const groundGeometry = new THREE.PlaneGeometry(20000, 20000);
            const groundMaterial = new THREE.MeshStandardMaterial(props);
            const ground = new THREE.Mesh(groundGeometry, groundMaterial);
            ground.rotation.x = -Math.PI / 2;
            ground.position.y = -1;
            ground.receiveShadow = true;
            
            // 根据环境类型添加装饰物
            switch (type) {
                case 'city':
                    this.addCityDecorations(group);
                    break;
                case 'rural':
                    this.addRuralDecorations(group);
                    break;
                case 'mountain':
                    this.addMountainDecorations(group);
                    break;
                // ... 其他环境类型的装饰物 ...
            }
            
            group.add(ground);
            this.environmentObjects.set(type, group);
        }
    }
    
    addCityDecorations(group) {
        // 添加简单的建筑物
        for (let i = 0; i < 20; i++) {
            const height = Math.random() * 300 + 100;
            const geometry = new THREE.BoxGeometry(50, height, 50);
            const material = new THREE.MeshStandardMaterial({
                color: 0xcccccc,
                roughness: 0.7,
                metalness: 0.3
            });
            const building = new THREE.Mesh(geometry, material);
            
            building.position.x = (Math.random() - 0.5) * 1000;
            building.position.y = height / 2;
            building.position.z = (Math.random() - 0.5) * 1000;
            
            building.castShadow = true;
            building.receiveShadow = true;
            
            group.add(building);
        }
    }
    
    addRuralDecorations(group) {
        // 添加简单的房屋和树木
        for (let i = 0; i < 10; i++) {
            // 房屋
            const house = new THREE.Group();
            
            const baseGeometry = new THREE.BoxGeometry(40, 30, 40);
            const baseMaterial = new THREE.MeshStandardMaterial({
                color: 0xD2691E,
                roughness: 0.8,
                metalness: 0.2
            });
            const base = new THREE.Mesh(baseGeometry, baseMaterial);
            
            const roofGeometry = new THREE.ConeGeometry(30, 20, 4);
            const roofMaterial = new THREE.MeshStandardMaterial({
                color: 0x8B4513,
                roughness: 0.7,
                metalness: 0.3
            });
            const roof = new THREE.Mesh(roofGeometry, roofMaterial);
            roof.position.y = 25;
            roof.rotation.y = Math.PI / 4;
            
            house.add(base);
            house.add(roof);
            house.position.set(
                (Math.random() - 0.5) * 1000,
                15,
                (Math.random() - 0.5) * 1000
            );
            
            house.traverse((obj) => {
                if (obj.isMesh) {
                    obj.castShadow = true;
                    obj.receiveShadow = true;
                }
            });
            
            group.add(house);
            
            // 树木
            for (let j = 0; j < 3; j++) {
                const tree = new THREE.Group();
                
                const trunkGeometry = new THREE.CylinderGeometry(2, 3, 20);
                const trunkMaterial = new THREE.MeshStandardMaterial({
                    color: 0x8B4513,
                    roughness: 0.9,
                    metalness: 0.1
                });
                const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
                
                const leavesGeometry = new THREE.ConeGeometry(10, 30, 8);
                const leavesMaterial = new THREE.MeshStandardMaterial({
                    color: 0x228B22,
                    roughness: 0.8,
                    metalness: 0.1
                });
                const leaves = new THREE.Mesh(leavesGeometry, leavesMaterial);
                leaves.position.y = 25;
                
                tree.add(trunk);
                tree.add(leaves);
                tree.position.set(
                    house.position.x + (Math.random() - 0.5) * 100,
                    10,
                    house.position.z + (Math.random() - 0.5) * 100
                );
                
                tree.traverse((obj) => {
                    if (obj.isMesh) {
                        obj.castShadow = true;
                        obj.receiveShadow = true;
                    }
                });
                
                group.add(tree);
            }
        }
    }
    
    addMountainDecorations(group) {
        // 添加山脉
        for (let i = 0; i < 5; i++) {
            const mountainGeometry = new THREE.ConeGeometry(200, 500, 4);
            const mountainMaterial = new THREE.MeshStandardMaterial({
                color: 0x696969,
                roughness: 0.9,
                metalness: 0.1
            });
            const mountain = new THREE.Mesh(mountainGeometry, mountainMaterial);
            
            mountain.position.x = (Math.random() - 0.5) * 2000;
            mountain.position.y = 250;
            mountain.position.z = (Math.random() - 0.5) * 2000;
            mountain.rotation.y = Math.random() * Math.PI;
            
            mountain.castShadow = true;
            mountain.receiveShadow = true;
            
            group.add(mountain);
        }
    }
    
    setEnvironment(type) {
        // 移除当前环境
        if (this.currentEnvironment) {
            this.scene.remove(this.currentEnvironment);
        }
        
        // 设置新环境
        const environment = this.environmentObjects.get(type);
        if (environment) {
            this.scene.add(environment);
            this.currentEnvironment = environment;
        }
    }
}

// 渲染管理器类
class RenderManager {
    constructor(scene, camera, renderer) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.enabled = false;
        this.currentWeather = 'sunny';
        this.currentTime = 12;
        this.currentLocation = 'beijing';
        this.currentScene = 'city';
        
        // 初始化天空盒和环境贴图
        this.skyboxes = {};
        this.envMaps = {};
        this.weatherEffects = {};
        this.loadSkyboxes();
        
        // 创建太阳光源
        this.sunLight = new THREE.DirectionalLight(0xffffff, 1);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.width = 2048;
        this.sunLight.shadow.mapSize.height = 2048;
        this.sunLight.shadow.camera.near = 0.5;
        this.sunLight.shadow.camera.far = 50000;
        this.scene.add(this.sunLight);
        
        // 创建环境光
        this.ambientLight = new THREE.AmbientLight(0x404040, 1);
        this.scene.add(this.ambientLight);
        
        // 初始化粒子系统（用于雨雪效果）
        this.particleSystem = null;
        
        this.initEventListeners();
        
        // 添加场景环境管理器
        this.sceneEnvironment = new SceneEnvironment(scene);
    }
    
    async loadSkyboxes() {
        // 设置默认背景颜色为天蓝色
        const defaultColor = new THREE.Color(0x87CEEB);
        this.scene.background = defaultColor;
        
        // 由于纹理文件不存在，我们暂时不加载它们
        console.log('Skybox textures not found - using default background color');
        
        // 创建默认环境贴图
        const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
        pmremGenerator.compileEquirectangularShader();
        
        // 创建一个默认的环境贴图
        const defaultEnvMap = pmremGenerator.fromScene(new THREE.Scene()).texture;
        this.envMaps.default = defaultEnvMap;
        pmremGenerator.dispose();
        
        // 初始化场景
        this.updateRendering();
    }
    
    initEventListeners() {
        // 监听渲染开关
        document.getElementById('render-toggle').addEventListener('change', (e) => {
            this.enabled = e.target.checked;
            this.updateRendering();
        });
        
        // 监听天气选择
        document.getElementById('weather-select').addEventListener('change', (e) => {
            this.currentWeather = e.target.value;
            this.updateWeather();
        });
        
        // 监听时间滑块
        document.getElementById('time-slider').addEventListener('input', (e) => {
            this.currentTime = parseFloat(e.target.value);
            document.getElementById('time-value').textContent = 
                `${Math.floor(this.currentTime)}:${(this.currentTime % 1 * 60).toFixed(0).padStart(2, '0')}`;
            this.updateSunPosition();
        });
        
        // 监听地点选择
        document.getElementById('location-select').addEventListener('change', (e) => {
            this.currentLocation = e.target.value;
            this.updateSunPosition();
        });
        
        // 监听场景选择
        document.getElementById('scene-select').addEventListener('change', (e) => {
            this.currentScene = e.target.value;
            this.updateScene();
        });
    }
    
    updateRendering() {
        if (this.enabled) {
            this.updateWeather();
            this.updateSunPosition();
            this.updateScene();
            
            // 更新天空盒
            if (this.skyboxes[this.currentWeather]) {
                this.scene.background = this.skyboxes[this.currentWeather];
                
                // 更新环境贴图
                if (this.envMaps.default) {
                    this.scene.environment = this.envMaps.default;
                    this.scene.traverse((object) => {
                        if (object.isMesh && object.material) {
                            object.material.envMap = this.envMaps.default;
                            object.material.needsUpdate = true;
                        }
                    });
                }
            }
        } else {
            this.resetRendering();
        }
    }
    
    updateWeather() {
        if (!this.enabled) return;
        
        // 清除现有的天气效果
        if (this.particleSystem) {
            this.scene.remove(this.particleSystem);
            this.particleSystem = null;
        }
        
        switch (this.currentWeather) {
            case 'sunny':
                this.sunLight.intensity = 1.2;
                this.ambientLight.intensity = 0.8;
                break;
            case 'cloudy':
                this.sunLight.intensity = 0.6;
                this.ambientLight.intensity = 1.0;
                break;
            case 'rainy':
                this.sunLight.intensity = 0.4;
                this.ambientLight.intensity = 0.6;
                this.createRainEffect();
                break;
            case 'snowy':
                this.sunLight.intensity = 0.8;
                this.ambientLight.intensity = 1.2;
                this.createSnowEffect();
                break;
        }
    }
    
    updateSunPosition() {
        if (!this.enabled) return;
        
        // 获取当前位置的经纬度
        const locations = {
            'beijing': { lat: 39.9, lon: 116.4 },
            'tokyo': { lat: 35.7, lon: 139.7 },
            'newyork': { lat: 40.7, lon: -74.0 },
            'london': { lat: 51.5, lon: -0.1 },
            'paris': { lat: 48.9, lon: 2.4 },
            'sydney': { lat: -33.9, lon: 151.2 },
            'dubai': { lat: 25.2, lon: 55.3 },
            'moscow': { lat: 55.8, lon: 37.6 },
            'singapore': { lat: 1.4, lon: 103.8 },
            'cairo': { lat: 30.0, lon: 31.2 }
        };
        
        const loc = locations[this.currentLocation];
        const time = this.currentTime;
        
        // 计算太阳位置
        const altitude = Math.sin((time - 12) * Math.PI / 12) * 90;
        const azimuth = ((time / 24) * 360 + 180) % 360;
        
        // 调整太阳光方向
        const radius = 20000;
        const sunX = radius * Math.cos(altitude * Math.PI / 180) * Math.sin(azimuth * Math.PI / 180);
        const sunY = radius * Math.sin(altitude * Math.PI / 180);
        const sunZ = radius * Math.cos(altitude * Math.PI / 180) * Math.cos(azimuth * Math.PI / 180);
        
        this.sunLight.position.set(sunX, sunY, sunZ);
        this.sunLight.lookAt(0, 0, 0);
    }
    
    updateScene() {
        if (!this.enabled) return;
        
        // 更新场景环境
        this.sceneEnvironment.setEnvironment(this.currentScene);
    }
    
    createRainEffect() {
        const rainGeometry = new THREE.BufferGeometry();
        const rainCount = 15000;
        const positions = new Float32Array(rainCount * 3);
        const velocities = new Float32Array(rainCount);
        
        for (let i = 0; i < rainCount * 3; i += 3) {
            positions[i] = Math.random() * 20000 - 10000;
            positions[i + 1] = Math.random() * 5000;
            positions[i + 2] = Math.random() * 20000 - 10000;
            velocities[i / 3] = 20 + Math.random() * 10;
        }
        
        rainGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        rainGeometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 1));
        
        const rainMaterial = new THREE.PointsMaterial({
            color: 0x99ccff,
            size: 2,
            transparent: true,
            opacity: 0.6
        });
        
        this.particleSystem = new THREE.Points(rainGeometry, rainMaterial);
        this.scene.add(this.particleSystem);
    }
    
    createSnowEffect() {
        const snowGeometry = new THREE.BufferGeometry();
        const snowCount = 10000;
        const positions = new Float32Array(snowCount * 3);
        const velocities = new Float32Array(snowCount);
        
        for (let i = 0; i < snowCount * 3; i += 3) {
            positions[i] = Math.random() * 20000 - 10000;
            positions[i + 1] = Math.random() * 5000;
            positions[i + 2] = Math.random() * 20000 - 10000;
            velocities[i / 3] = 5 + Math.random() * 5;
        }
        
        snowGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        snowGeometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 1));
        
        const snowMaterial = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 4,
            transparent: true,
            opacity: 0.8
        });
        
        this.particleSystem = new THREE.Points(snowGeometry, snowMaterial);
        this.scene.add(this.particleSystem);
    }
    
    resetRendering() {
        // 重置光照
        this.sunLight.intensity = 2;
        this.ambientLight.intensity = 2;
        
        // 移除天气效果
        if (this.particleSystem) {
            this.scene.remove(this.particleSystem);
            this.particleSystem = null;
        }
        
        // 重置天空盒和环境贴图
        this.scene.background = new THREE.Color(0xf0f0f0);
        this.scene.environment = null;
        this.scene.traverse((object) => {
            if (object.isMesh && object.material) {
                object.material.envMap = null;
                object.material.needsUpdate = true;
            }
        });
        
        // 重置地面材质
        const ground = this.scene.getObjectByName('ground');
        if (ground) {
            ground.material = new THREE.MeshStandardMaterial({
                color: 0x808080,
                roughness: 0.8,
                metalness: 0.2
            });
        }
    }
    
    update() {
        if (!this.enabled) return;
        
        // 更新粒子系统
        if (this.particleSystem) {
            const positions = this.particleSystem.geometry.attributes.position.array;
            const velocities = this.particleSystem.geometry.attributes.velocity.array;
            
            for (let i = 0; i < positions.length; i += 3) {
                positions[i + 1] -= velocities[i / 3];
                
                if (positions[i + 1] < 0) {
                    positions[i + 1] = 5000;
                }
            }
            
            this.particleSystem.geometry.attributes.position.needsUpdate = true;
        }
    }
}

// **加载 JSON 文件**
async function loadJSON() {
    const response = await fetch("building.json");
    jsonModel = await response.json();
}

// **初始化 Three.js 场景**
async function init() {
    await loadJSON();

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    
    camera = new THREE.PerspectiveCamera(75, window.innerWidth * 0.8 / window.innerHeight, 0.1, 50000);
    camera.position.set(15000, 15000, 15000);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth * 0.8, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.getElementById('viewer').appendChild(renderer.domElement);
    
    // 创建渲染管理器
    renderManager = new RenderManager(scene, camera, renderer);
    
    // 添加光源
    const ambientLight = new THREE.AmbientLight(0x404040, 2);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
    directionalLight.position.set(10000, 20000, 10000);
    scene.add(directionalLight);
    
    // 添加网格
    const gridHelper = new THREE.GridHelper(30000, 30);
    scene.add(gridHelper);
    
    // 初始化物理世界
    initPhysics();
    
    // 初始化控制器
    controls = new OrbitControls(camera, renderer.domElement);
    controls.mouseButtons = {
        LEFT: null,
        MIDDLE: null,
        RIGHT: THREE.MOUSE.ROTATE  // 将旋转功能改为右键
    };
    controls.enablePan = true;  // 启用平移
    controls.enableZoom = true;  // 启用缩放
    controls.panButton = THREE.MOUSE.MIDDLE;  // 中键平移
    initTransformControls();

    // 添加点击事件监听器
    renderer.domElement.addEventListener('click', onObjectClick);
    renderer.domElement.addEventListener('click', onFaceClick);

    // 添加新的全局键盘事件监听器
    window.addEventListener('keydown', function(event) {
        // Ctrl + Z: 撤销
        if (event.ctrlKey && !event.shiftKey && event.key.toLowerCase() === 'z') {
            event.preventDefault();
            undo();
            return;
        }
        // Ctrl + Shift + Z: 重做
        if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'z') {
            event.preventDefault();
            redo();
            return;
        }
    });

    // 加载模型
    loadModel();
    
    // 初始化其他功能
    initDragAndDrop();
    initObjectSelection();
    dimensionsPanel = document.getElementById('dimensions-panel');
    
    animate();

    // 添加变换控制按钮的事件监听
    document.getElementById('translate-btn').addEventListener('click', () => {
        if (transformControls && selectedObject) {
            transformControls.setMode('translate');
            transformControls.showX = true;
            transformControls.showY = true;
            transformControls.showZ = true;
        }
    });

    document.getElementById('rotate-btn').addEventListener('click', () => {
        if (transformControls && selectedObject) {
            transformControls.setMode('rotate');
            transformControls.showX = true;
            transformControls.showY = true;
            transformControls.showZ = true;
        }
    });

    document.getElementById('scale-btn').addEventListener('click', () => {
        if (transformControls && selectedObject) {
            transformControls.setMode('scale');
            transformControls.showX = true;
            transformControls.showY = true;
            transformControls.showZ = true;
        }
    });

    document.getElementById('xy-plane-btn').addEventListener('click', () => {
        if (transformControls && selectedObject) {
            transformControls.setMode('translate');
            transformControls.showX = true;
            transformControls.showY = true;
            transformControls.showZ = false;
        }
    });

    document.getElementById('yz-plane-btn').addEventListener('click', () => {
        if (transformControls && selectedObject) {
            transformControls.setMode('translate');
            transformControls.showY = true;
            transformControls.showZ = true;
            transformControls.showX = false;
        }
    });

    document.getElementById('xz-plane-btn').addEventListener('click', () => {
        if (transformControls && selectedObject) {
            transformControls.setMode('translate');
            transformControls.showX = true;
            transformControls.showZ = true;
            transformControls.showY = false;
        }
    });
}

// **点击对象处理**
function onObjectClick(event) {
    if (isDragging) return; // 如果正在拖动，不处理点击
    
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    // 计算鼠标在画布中的位置
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // 设置射线
    raycaster.setFromCamera(mouse, camera);

    // 检测相交的对象
    const intersects = raycaster.intersectObjects(meshes, true);

    if (intersects.length > 0) {
        const object = intersects[0].object;
        
        // 如果点击的是同一个对象，不做任何处理
        if (selectedObject === object) return;
        
        // 选择新对象
        selectObject(object);
        
        // 确保变换控制器被添加到场景中并启用
        if (!scene.children.includes(transformControls)) {
            scene.add(transformControls);
        }
        transformControls.attach(object);
        transformControls.enabled = true;
        
        // 更新维度面板
        updateDimensions(object);
    } else {
        // 点击空白处时，取消选择并关闭变换控制器
        if (selectedObject) {
            selectObject(null);
        }
        if (transformControls) {
            transformControls.detach();
            transformControls.enabled = false;
        }
        if (dimensionsPanel) {
            dimensionsPanel.style.display = 'none';
        }
    }
}

// **更新模型数据**
function updateModelData() {
    if (!selectedObject) return;

    // 获取对象在场景中的位置
    const position = selectedObject.position;
    const rotation = selectedObject.rotation;
    const scale = selectedObject.scale;

    // 更新 JSON 模型中对应对象的数据
    const objectId = selectedObject.userData.id;
    const object = jsonModel.objects.find(obj => obj.id === objectId);
    
    if (object) {
        // 更新变换数据，交换 Y 和 Z 坐标以匹配 JSON 坐标系
        object.transform.position = [position.x, position.z, position.y];
        object.transform.rotation = [rotation.x, rotation.z, rotation.y];
        object.transform.scale = [scale.x, scale.z, scale.y];

        // 更新边界框
        const geometry = selectedObject.geometry;
        const boundingBox = new THREE.Box3().setFromObject(selectedObject);
        object.bounding_box.min = [
            boundingBox.min.x,
            boundingBox.min.z,
            boundingBox.min.y
        ];
        object.bounding_box.max = [
            boundingBox.max.x,
            boundingBox.max.z,
            boundingBox.max.y
        ];
    }
}

// **添加变换模式切换按钮**
function addTransformControls() {
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.top = '10px';
    container.style.left = '10px';
    container.style.zIndex = '1000';

    const translateButton = document.createElement('button');
    translateButton.textContent = 'move';
    translateButton.onclick = () => {
        transformControls.setMode('translate');
        transformControls.showX = true;
        transformControls.showY = true;
        transformControls.showZ = true;
        transformControls.size = 1;
    };
    container.appendChild(translateButton);

    const rotateButton = document.createElement('button');
    rotateButton.textContent = 'rotate';
    rotateButton.onclick = () => {
        transformControls.setMode('rotate');
        transformControls.showX = true;
        transformControls.showY = true;
        transformControls.showZ = true;
        transformControls.size = 1;
    };
    container.appendChild(rotateButton);

    const scaleButton = document.createElement('button');
    scaleButton.textContent = 'scale';
    scaleButton.onclick = () => {
        transformControls.setMode('scale');
        transformControls.showX = true;
        transformControls.showY = true;
        transformControls.showZ = true;
        transformControls.size = 1;
    };
    container.appendChild(scaleButton);

    // 添加平面移动按钮
    const planeXYButton = document.createElement('button');
    planeXYButton.textContent = 'XY plane';
    planeXYButton.onclick = () => {
        transformControls.setMode('translate');
        transformControls.showX = true;
        transformControls.showY = true;
        transformControls.showZ = false;
        transformControls.size = 1;
    };
    container.appendChild(planeXYButton);

    const planeYZButton = document.createElement('button');
    planeYZButton.textContent = 'YZ plane';
    planeYZButton.onclick = () => {
        transformControls.setMode('translate');
        transformControls.showY = true;
        transformControls.showZ = true;
        transformControls.showX = false;
        transformControls.size = 1;
    };
    container.appendChild(planeYZButton);

    const planeXZButton = document.createElement('button');
    planeXZButton.textContent = 'XZ plane';
    planeXZButton.onclick = () => {
        transformControls.setMode('translate');
        transformControls.showX = true;
        transformControls.showZ = true;
        transformControls.showY = false;
        transformControls.size = 1;
    };
    container.appendChild(planeXZButton);

    document.body.appendChild(container);
}

// **修改 loadModel 函数**
function loadModel() {
    scene.children = scene.children.filter(child => 
        !child.isMesh && !(child instanceof TransformControls)
    );

    const building = jsonModel.building;
    const floorHeight = building.floor_height;
    const floors = building.floors;

    jsonModel.objects.forEach((obj, index) => {
        if (obj.geometry.vertices) {
            // 计算几何体的边界框
            const boundingBox = {
                min: new THREE.Vector3(Infinity, Infinity, Infinity),
                max: new THREE.Vector3(-Infinity, -Infinity, -Infinity)
            };
            
            // 找出边界框，注意这里交换 Y 和 Z 坐标
            obj.geometry.vertices.forEach(vertex => {
                boundingBox.min.x = Math.min(boundingBox.min.x, vertex[0]);
                boundingBox.min.y = Math.min(boundingBox.min.y, vertex[2]); // 使用 Z 作为 Y
                boundingBox.min.z = Math.min(boundingBox.min.z, vertex[1]); // 使用 Y 作为 Z
                boundingBox.max.x = Math.max(boundingBox.max.x, vertex[0]);
                boundingBox.max.y = Math.max(boundingBox.max.y, vertex[2]); // 使用 Z 作为 Y
                boundingBox.max.z = Math.max(boundingBox.max.z, vertex[1]); // 使用 Y 作为 Z
            });
            
            // 计算中心点
            const center = new THREE.Vector3(
                (boundingBox.min.x + boundingBox.max.x) / 2,
                (boundingBox.min.y + boundingBox.max.y) / 2,
                (boundingBox.min.z + boundingBox.max.z) / 2
            );

            // 创建顶点，将所有顶点相对于中心点重新定位，同时交换 Y 和 Z 坐标
            const vertexArray = new Float32Array(
                obj.geometry.vertices.flatMap(vertex => [
                    vertex[0] - center.x,
                    vertex[2] - center.y, // 使用 Z 作为 Y
                    vertex[1] - center.z  // 使用 Y 作为 Z
                ])
            );

            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(vertexArray, 3));

            // 创建面索引
            const indices = [];
            obj.geometry.faces.forEach(face => {
                if (face.length === 4) {
                    indices.push(face[0], face[1], face[2]);
                    indices.push(face[2], face[3], face[0]);
                } else {
                    indices.push(...face);
                }
            });

            geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(indices), 1));
            geometry.computeVertexNormals();

            // 创建基础材质
            const material = new THREE.MeshPhongMaterial({
                transparent: obj.material.transparency > 0,
                opacity: 1 - obj.material.transparency,
                side: THREE.DoubleSide,
                roughness: obj.material.roughness || 0.5
            });

            // 优先加载纹理
            if (obj.material.texture) {
                const textureLoader = new THREE.TextureLoader();
                textureLoader.load(obj.material.texture, (texture) => {
                    material.map = texture;
                    material.needsUpdate = true;
                });
            } else {
                // 如果没有纹理，则使用颜色
                material.color = new THREE.Color(
                    obj.material.color[0] / 255,
                    obj.material.color[1] / 255,
                    obj.material.color[2] / 255
                );
            }

            const mesh = new THREE.Mesh(geometry, material);
            
            // 将网格位置设置为计算出的中心点
            mesh.position.copy(center);
            
            mesh.userData.id = obj.id;
            mesh.userData.layer = obj.layer;
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            scene.add(mesh);
            meshes.push(mesh);

            // 创建物理体
            const size = new THREE.Vector3();
            const box = new THREE.Box3().setFromObject(mesh);
            box.getSize(size);
            
            const shape = new CANNON.Box(new CANNON.Vec3(size.x/2, size.y/2, size.z/2));
            const body = new CANNON.Body({
                mass: 0,
                position: new CANNON.Vec3(mesh.position.x, mesh.position.y, mesh.position.z),
                shape: shape,
                material: new CANNON.Material({
                    friction: 1.0,
                    restitution: 0
                }),
                type: CANNON.Body.STATIC
            });
            
            world.addBody(body);
            bodies.push(body);
        }
    });
}

// **初始化物理世界**
function initPhysics() {
    world = new CANNON.World({
        gravity: new CANNON.Vec3(0, -9.82, 0)
    });
    
    // 设置世界参数 - 完全禁止弹跳和滑动
    world.defaultContactMaterial.friction = 1.0;
    world.defaultContactMaterial.restitution = 0;
    world.defaultContactMaterial.contactEquationStiffness = 1e8;
    world.defaultContactMaterial.contactEquationRelaxation = 3;
    world.defaultContactMaterial.frictionEquationStiffness = 1e8;
    
    // 添加地面
    const groundShape = new CANNON.Plane();
    const groundBody = new CANNON.Body({
        mass: 0,
        shape: groundShape,
        material: new CANNON.Material({
            friction: 1.0,
            restitution: 0
        })
    });
    groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    world.addBody(groundBody);

    // 创建接触材质 - 确保与地面的完全非弹性碰撞
    const groundContactMaterial = new CANNON.ContactMaterial(
        groundBody.material,
        new CANNON.Material(),
        {
            friction: 1.0,
            restitution: 0,
            contactEquationStiffness: 1e8,
            contactEquationRelaxation: 3,
            frictionEquationStiffness: 1e8,
            frictionEquationRegularizationTime: 3
        }
    );
    world.addContactMaterial(groundContactMaterial);
}

// **创建形状**
function createShape(type, position) {
    let geometry, material, mesh;
    const defaultSize = 1000;
    
    switch(type) {
        case 'cube':
            geometry = new THREE.BoxGeometry(defaultSize, defaultSize, defaultSize);
            material = new THREE.MeshPhongMaterial({ 
                color: 0xcccccc,
                transparent: true,
                opacity: 0.8,
                emissive: 0x000000
            });
            break;
        case 'sphere':
            geometry = new THREE.SphereGeometry(defaultSize/2, 32, 32);
            material = new THREE.MeshPhongMaterial({ 
                color: 0xcccccc,
                transparent: true,
                opacity: 0.8,
                emissive: 0x000000
            });
            break;
        case 'cylinder':
            geometry = new THREE.CylinderGeometry(defaultSize/2, defaultSize/2, defaultSize, 32);
            material = new THREE.MeshPhongMaterial({ 
                color: 0xcccccc,
                transparent: true,
                opacity: 0.8,
                emissive: 0x000000
            });
            break;
        case 'cone':
            geometry = new THREE.ConeGeometry(defaultSize/2, defaultSize, 32);
            material = new THREE.MeshPhongMaterial({ 
                color: 0xcccccc,
                transparent: true,
                opacity: 0.8,
                emissive: 0x000000
            });
            break;
        case 'torus':
            geometry = new THREE.TorusGeometry(defaultSize/2, defaultSize/4, 16, 100);
            material = new THREE.MeshPhongMaterial({ 
                color: 0xcccccc,
                transparent: true,
                opacity: 0.8,
                emissive: 0x000000
            });
            break;
        case 'plane':
            geometry = new THREE.PlaneGeometry(defaultSize, defaultSize);
            material = new THREE.MeshPhongMaterial({ 
                color: 0xcccccc,
                transparent: true,
                opacity: 0.8,
                emissive: 0x000000
            });
            break;
    }
    
    mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    
    // 获取物体的边界框
    const box = new THREE.Box3().setFromObject(mesh);
    const height = box.max.y - box.min.y;
    
    // 确保初始位置不低于地面
    if (mesh.position.y < height / 2) {
        mesh.position.y = height / 2;
    }
    
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    // 为每个面添加索引信息
    geometry.faces = [];
    for (let i = 0; i < geometry.attributes.position.count / 3; i++) {
        geometry.faces.push({
            index: i,
            normal: new THREE.Vector3(),
            vertices: [i * 3, i * 3 + 1, i * 3 + 2]
        });
    }
    
    scene.add(mesh);
    meshes.push(mesh);
    
    // 创建物理体
    let shape;
    
    switch(type) {
        case 'cube':
            shape = new CANNON.Box(new CANNON.Vec3(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z));
            break;
        case 'sphere':
            shape = new CANNON.Sphere(box.max.x - box.min.x);
            break;
        case 'cylinder':
            shape = new CANNON.Cylinder(box.max.x - box.min.x, box.max.x - box.min.x, box.max.y - box.min.y, 32);
            break;
        case 'cone':
            shape = new CANNON.Cylinder(0, box.max.x - box.min.x, box.max.y - box.min.y, 32);
            break;
        case 'plane':
            shape = new CANNON.Plane();
            break;
        default:
            // 对于其他形状，使用包围盒
            shape = new CANNON.Box(new CANNON.Vec3(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z));
    }
    
    // 创建物理体时设置正确的初始位置和参数
    const body = new CANNON.Body({
        mass: 1,
        position: new CANNON.Vec3(mesh.position.x, mesh.position.y, mesh.position.z),
        shape: shape,
        material: new CANNON.Material({
            friction: 1.0,
            restitution: 0
        }),
        linearDamping: 0.99, // 增加线性阻尼
        angularDamping: 0.99, // 增加角度阻尼
        fixedRotation: true, // 防止物体翻滚
        allowSleep: true, // 允许物体休眠
        sleepSpeedLimit: 0.1, // 休眠速度阈值
        sleepTimeLimit: 0.1 // 休眠时间阈值
    });
    
    world.addBody(body);
    bodies.push(body);
    
    // 在创建新对象后保存状态
    saveState();
    
    return mesh;
}

// **更新物理体位置**
function updatePhysicsBody(mesh) {
    if (!mesh) return;
    
    const index = meshes.indexOf(mesh);
    if (index !== -1 && bodies[index]) {
        const body = bodies[index];
        
        // 获取物体的边界框
        const box = new THREE.Box3().setFromObject(mesh);
        const height = box.max.y - box.min.y;
        
        // 确保物体不会低于地面
        if (mesh.position.y <= height / 2) {
            mesh.position.y = height / 2;
            // 完全停止物体的所有运动
            body.velocity.setZero();
            body.angularVelocity.setZero();
            body.force.setZero();
            body.torque.setZero();
            body.sleep();
        }
        
        // 更新物理体位置
        body.position.copy(mesh.position);
        body.quaternion.copy(mesh.quaternion);
    }
}

// **更新尺寸面板**
function updateDimensions(object) {
    if (!dimensionsPanel) {
        dimensionsPanel = document.getElementById('dimensions-panel');
    }
    
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    
    document.getElementById('dim-x').textContent = size.x.toFixed(2);
    document.getElementById('dim-y').textContent = size.y.toFixed(2);
    document.getElementById('dim-z').textContent = size.z.toFixed(2);
    
    dimensionsPanel.style.display = 'block';
}

// **处理拖放**
function initDragAndDrop() {
    const shapeItems = document.querySelectorAll('.shape-item');
    const viewer = document.getElementById('viewer');
    
    // 创建一个用于拖放的平面
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    
    shapeItems.forEach(item => {
        item.addEventListener('dragstart', (e) => {
            isDragging = true;
            e.dataTransfer.setData('shape', item.dataset.shape);
        });
    });
    
    viewer.addEventListener('dragover', (e) => {
        e.preventDefault();
        const rect = viewer.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / viewer.clientWidth) * 2 - 1;
        const y = -((e.clientY - rect.top) / viewer.clientHeight) * 2 + 1;
        
        // 创建一个射线
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2(x, y);
        raycaster.setFromCamera(mouse, camera);
        
        // 计算与网格平面的交点
        const intersectPoint = new THREE.Vector3();
        raycaster.ray.intersectPlane(plane, intersectPoint);
        
        // 保存当前的交点位置
        e.dataTransfer.dropEffect = 'copy';
        viewer.dataset.dropX = intersectPoint.x;
        viewer.dataset.dropY = intersectPoint.y;
        viewer.dataset.dropZ = intersectPoint.z;
    });
    
    viewer.addEventListener('drop', (e) => {
        e.preventDefault();
        isDragging = false;
        
        const shape = e.dataTransfer.getData('shape');
        
        // 使用保存的交点位置
        const position = new THREE.Vector3(
            parseFloat(viewer.dataset.dropX),
            parseFloat(viewer.dataset.dropY),
            parseFloat(viewer.dataset.dropZ)
        );
        
        // 创建形状
        const mesh = createShape(shape, position);
        
        // 调整位置使物体最低面接触地面
        const box = new THREE.Box3().setFromObject(mesh);
        const height = box.max.y - box.min.y;
        mesh.position.y = height / 2; // 将物体上移一半高度，使底面接触地面
        
        // 更新物理体位置
        const index = meshes.indexOf(mesh);
        if (index !== -1) {
            bodies[index].position.copy(mesh.position);
        }
        
        selectObject(mesh);
    });
}

// **选择对象**
function selectObject(object) {
    // 如果之前有选中的对象，先清除其状态
    if (selectedObject) {
        // 移除之前对象的拖拽事件监听器
        if (selectedObject.userData.dragListeners) {
            const listeners = selectedObject.userData.dragListeners;
            renderer.domElement.removeEventListener('mousedown', listeners.mouseDown);
            document.removeEventListener('mousemove', listeners.mouseMove);
            document.removeEventListener('mouseup', listeners.mouseUp);
            delete selectedObject.userData.dragListeners;
        }
        
        // 重置之前选中对象的材质
        if (Array.isArray(selectedObject.material)) {
            selectedObject.material.forEach(mat => {
                if (mat && mat.emissive) {
                    mat.emissive.setHex(0x000000);
                }
            });
        } else if (selectedObject.material && selectedObject.material.emissive) {
            selectedObject.material.emissive.setHex(0x000000);
        }
        
        // 分离变换控制器
        if (transformControls) {
            transformControls.detach();
        }
    }
    
    selectedObject = object;
    
    if (selectedObject) {
        // 设置新选中对象的材质
        if (Array.isArray(selectedObject.material)) {
            selectedObject.material.forEach(mat => {
                if (mat && mat.emissive) {
                    mat.emissive.setHex(0x333333);
                }
            });
        } else if (selectedObject.material && selectedObject.material.emissive) {
            selectedObject.material.emissive.setHex(0x333333);
        }
        
        // 确保变换控制器被添加到场景中
        if (!scene.children.includes(transformControls)) {
            scene.add(transformControls);
        }
        
        // 附加变换控制器到选中的对象
        transformControls.attach(selectedObject);
        transformControls.enabled = true;
        transformControls.visible = true;
        transformControls.showX = true;
        transformControls.showY = true;
        transformControls.showZ = true;
        
        // 更新维度面板
        updateDimensions(selectedObject);
    } else {
        // 如果没有选中对象，隐藏变换控制器和维度面板
        if (transformControls) {
            transformControls.detach();
            transformControls.enabled = false;
            transformControls.visible = false;
        }
        if (dimensionsPanel) {
            dimensionsPanel.style.display = 'none';
        }
    }
}

// **点击选择对象**
function initObjectSelection() {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let isSelecting = false;
    
    renderer.domElement.addEventListener('mousedown', (event) => {
        if (event.button !== 0) return; // 只响应左键
        
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(meshes);
        
        if (intersects.length > 0) {
            // 点击到对象时，选中对象
            selectObject(intersects[0].object);
            isSelecting = false;
        } else {
            // 点击空白处时，开始框选
            isSelecting = true;
            mouseStartPosition.set(event.clientX, event.clientY);
            if (!selectionBox) {
                selectionBox = initSelectionBox();
            }
        }
    });
    
    renderer.domElement.addEventListener('mousemove', (event) => {
        if (isSelecting) {
            // 正在框选
            mouseEndPosition.set(event.clientX, event.clientY);
            updateSelectionBox(
                mouseStartPosition.x,
                mouseStartPosition.y,
                mouseEndPosition.x,
                mouseEndPosition.y
            );
        } else if (!isDragging) {
            // 不在框选也不在拖动时，允许场景旋转
            controls.enabled = true;
        }
    });
    
    renderer.domElement.addEventListener('mouseup', (event) => {
        if (event.button !== 0) return;
        
        if (isSelecting) {
            // 结束框选
            if (selectionBox) {
                const faces = getFacesInSelectionBox(
                    mouseStartPosition,
                    mouseEndPosition
                );
                selectedFaces = faces;
                
                faces.forEach(face => {
                    if (face.mesh && face.mesh.material) {
                        if (Array.isArray(face.mesh.material)) {
                            face.mesh.material[face.materialIndex].emissive.setHex(0xff0000);
                        } else {
                            face.mesh.material.emissive.setHex(0xff0000);
                        }
                    }
                });
                
                selectionBox.remove();
                selectionBox = null;
            }
            isSelecting = false;
        }
    });
}

// **修改 animate 函数**
function animate() {
    requestAnimationFrame(animate);
    
    world.step(1/60);
    
    // 更新网格位置
    for (let i = 0; i < meshes.length && i < bodies.length; i++) {
        if (meshes[i] !== selectedObject && bodies[i] !== null) {
            const box = new THREE.Box3().setFromObject(meshes[i]);
            const height = box.max.y - box.min.y;
            
            // 从物理体更新网格位置
            meshes[i].position.copy(bodies[i].position);
            meshes[i].quaternion.copy(bodies[i].quaternion);
            
            // 确保物体不会低于地面，并在接触地面时完全停止
            if (meshes[i].position.y <= height / 2) {
                meshes[i].position.y = height / 2;
                bodies[i].position.y = height / 2;
                // 完全停止物体的所有运动
                bodies[i].velocity.setZero();
                bodies[i].angularVelocity.setZero();
                bodies[i].force.setZero();
                bodies[i].torque.setZero();
                // 设置为休眠状态
                bodies[i].sleep();
            }
        }
    }
    
    // 更新渲染管理器
    renderManager.update();
    
    controls.update();
    renderer.render(scene, camera);
}

// **添加面选择功能**
function onFaceClick(event) {
    if (isMovingFace) return;
    
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(meshes, true);
    
    if (intersects.length > 0) {
        const intersect = intersects[0];
        const face = intersect.face;
        const mesh = intersect.object;
        
        // 如果不是按住Ctrl键，清除之前的选择
        if (!event.ctrlKey) {
            selectedFaces.forEach(selectedFace => {
                if (Array.isArray(mesh.material)) {
                    if (mesh.material[selectedFace.materialIndex]) {
                        mesh.material[selectedFace.materialIndex].emissive.setHex(0x000000);
                    }
                } else if (mesh.material) {
                    mesh.material.emissive.setHex(0x000000);
                }
            });
            selectedFaces = [];
        }
        
        // 添加新的选择
        selectedFaces.push(face);
        if (Array.isArray(mesh.material)) {
            if (mesh.material[face.materialIndex]) {
                mesh.material[face.materialIndex].emissive.setHex(0x333333);
            }
        } else if (mesh.material) {
            mesh.material.emissive.setHex(0x333333);
        }
        
        // 显示属性面板
        showFaceProperties(face, mesh);
    }
}

// **显示面属性面板**
function showFaceProperties(face, mesh) {
    const propertiesPanel = document.createElement('div');
    propertiesPanel.id = 'face-properties';
    propertiesPanel.style.position = 'absolute';
    propertiesPanel.style.left = '10px';
    propertiesPanel.style.top = '100px';
    propertiesPanel.style.background = 'white';
    propertiesPanel.style.padding = '10px';
    propertiesPanel.style.border = '1px solid #ccc';
    
    // 颜色选择
    const colorSelect = document.createElement('select');
    const colors = {
        'red': '#ff0000',
        'green': '#00ff00',
        'blue': '#0000ff',
        'yellow': '#ffff00',
        'white': '#ffffff'
    };
    
    Object.entries(colors).forEach(([name, value]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = name;
        colorSelect.appendChild(option);
    });
    
    colorSelect.addEventListener('change', (e) => {
        const color = new THREE.Color(e.target.value);
        if (Array.isArray(mesh.material)) {
            mesh.material[face.materialIndex].color = color;
        } else {
            mesh.material.color = color;
        }
    });
    
    propertiesPanel.appendChild(colorSelect);
    
    // 移除旧的属性面板
    const oldPanel = document.getElementById('face-properties');
    if (oldPanel) {
        oldPanel.remove();
    }
    
    document.body.appendChild(propertiesPanel);
}

// **处理键盘事件**
document.addEventListener('keydown', (event) => {
    if (!selectedFace) return;
    
    const moveAmount = 100; // 增加移动步长以匹配场景比例
    switch(event.key) {
        case 'x':
            moveFace(selectedFace, selectedObject, new THREE.Vector3(moveAmount, 0, 0));
            break;
        case 'y':
            moveFace(selectedFace, selectedObject, new THREE.Vector3(0, moveAmount, 0));
            break;
        case 'z':
            moveFace(selectedFace, selectedObject, new THREE.Vector3(0, 0, moveAmount));
            break;
    }
});

// **移动面**
function moveFace(face, mesh, direction) {
    const geometry = mesh.geometry;
    const positions = geometry.attributes.position.array;
    
    // 更新面的顶点位置
    for (let i = 0; i < 3; i++) {
        const vertexIndex = face.a + i; // face.a, face.b, face.c 是面的三个顶点索引
        positions[vertexIndex * 3] += direction.x;
        positions[vertexIndex * 3 + 1] += direction.y;
        positions[vertexIndex * 3 + 2] += direction.z;
    }
    
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    
    // 更新物理体
    updatePhysicsBody(mesh);
}

// **获取物体的边界点和顶点**
function getSnapPoints(mesh) {
    const points = [];
    const geometry = mesh.geometry;
    const positions = geometry.attributes.position.array;
    
    // 添加顶点
    for (let i = 0; i < positions.length; i += 3) {
        const point = new THREE.Vector3(
            positions[i],
            positions[i + 1],
            positions[i + 2]
        ).applyMatrix4(mesh.matrixWorld);
        points.push(point);
    }
    
    return points;
}

// **在场景中查找最近的吸附点**
function findNearestSnapPoint(position) {
    let nearest = null;
    let minDistance = snapDistance;
    
    meshes.forEach(mesh => {
        if (mesh === selectedObject) return;
        
        const points = getSnapPoints(mesh);
        points.forEach(point => {
            const distance = position.distanceTo(point);
            if (distance < minDistance) {
                minDistance = distance;
                nearest = point;
            }
        });
    });
    
    return nearest;
}

// **框选功能**
function initSelectionBox() {
    const selectionElement = document.createElement('div');
    selectionElement.style.position = 'fixed';
    selectionElement.style.border = '1px solid #55aaff';
    selectionElement.style.backgroundColor = 'rgba(75, 160, 255, 0.3)';
    selectionElement.style.pointerEvents = 'none';
    document.body.appendChild(selectionElement);
    
    return selectionElement;
}

// **更新框选区域**
function updateSelectionBox(startX, startY, endX, endY) {
    const left = Math.min(startX, endX);
    const top = Math.min(startY, endY);
    const width = Math.abs(endX - startX);
    const height = Math.abs(endY - startY);
    
    selectionBox.style.left = left + 'px';
    selectionBox.style.top = top + 'px';
    selectionBox.style.width = width + 'px';
    selectionBox.style.height = height + 'px';
}

// **获取框选区域内的面**
function getFacesInSelectionBox(start, end) {
    const faces = [];
    const frustum = new THREE.Frustum();
    const projScreenMatrix = new THREE.Matrix4();
    const meshFaces = new Map(); // 用于跟踪每个网格的面数
    
    projScreenMatrix.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse
    );
    frustum.setFromProjectionMatrix(projScreenMatrix);
    
    meshes.forEach(mesh => {
        let meshFaceCount = 0;
        mesh.geometry.faces.forEach(face => {
            const center = new THREE.Vector3();
            face.vertices.forEach(vertex => {
                center.add(new THREE.Vector3(
                    mesh.geometry.attributes.position.array[vertex * 3],
                    mesh.geometry.attributes.position.array[vertex * 3 + 1],
                    mesh.geometry.attributes.position.array[vertex * 3 + 2]
                ));
            });
            center.divideScalar(3);
            
            // 检查面的中心点是否在选择框内
            const screenPosition = center.clone()
                .applyMatrix4(mesh.matrixWorld)
                .project(camera);
            
            const x = (screenPosition.x + 1) * window.innerWidth / 2;
            const y = (-screenPosition.y + 1) * window.innerHeight / 2;
            
            if (x >= Math.min(start.x, end.x) && x <= Math.max(start.x, end.x) &&
                y >= Math.min(start.y, end.y) && y <= Math.max(start.y, end.y)) {
                faces.push(face);
                meshFaceCount++;
                face.mesh = mesh; // 保存面所属的网格
            }
        });
        
        if (meshFaceCount > 0) {
            meshFaces.set(mesh, meshFaceCount);
        }
    });
    
    // 检查是否有网格的所有面都被选中
    meshFaces.forEach((count, mesh) => {
        if (count === mesh.geometry.faces.length) {
            // 如果所有面都被选中，选择整个网格
            selectObject(mesh);
            // 启用拖拽功能
            enableDragging(mesh);
        }
    });
    
    return faces;
}

// 添加拖拽功能
function enableDragging(mesh) {
    let isDragging = false;
    let previousMousePosition = {
        x: 0,
        y: 0
    };
    
    const onMouseDown = (event) => {
        if (event.button !== 0) return; // 只响应左键
        
        const rect = renderer.domElement.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
        const intersects = raycaster.intersectObject(mesh);
        
        if (intersects.length > 0) {
            isDragging = true;
            previousMousePosition = {
                x: event.clientX,
                y: event.clientY
            };
            controls.enabled = false;
        }
    };
    
    const onMouseMove = (event) => {
        if (!isDragging) return;
        
        const deltaMove = {
            x: event.clientX - previousMousePosition.x,
            y: event.clientY - previousMousePosition.y
        };
        
        const rect = renderer.domElement.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        // 创建一个射线
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
        
        // 计算与网格平面的交点
        const planeNormal = new THREE.Vector3(0, 1, 0);
        const planeConstant = 0;
        const plane = new THREE.Plane(planeNormal, planeConstant);
        const intersectPoint = new THREE.Vector3();
        raycaster.ray.intersectPlane(plane, intersectPoint);
        
        mesh.position.copy(intersectPoint);
        
        // 确保物体不会低于地面
        const box = new THREE.Box3().setFromObject(mesh);
        const height = box.max.y - box.min.y;
        mesh.position.y = height / 2;
        
        // 更新物理体位置
        updatePhysicsBody(mesh);
        
        previousMousePosition = {
            x: event.clientX,
            y: event.clientY
        };
    };
    
    const onMouseUp = () => {
        isDragging = false;
        controls.enabled = true;
    };
    
    renderer.domElement.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    
    // 存储事件监听器以便后续移除
    mesh.userData.dragListeners = {
        mouseDown: onMouseDown,
        mouseMove: onMouseMove,
        mouseUp: onMouseUp
    };
}

// **添加删除功能**
document.addEventListener('keydown', (event) => {
    if (event.key === 'Delete' && selectedObject) {
        const index = meshes.indexOf(selectedObject);
        if (index !== -1) {
            scene.remove(selectedObject);
            world.remove(bodies[index]);
            meshes.splice(index, 1);
            bodies.splice(index, 1);
            selectObject(null);
        }
    }
});

// **修改 transformControls 的初始化**
function initTransformControls() {
    transformControls = new TransformControls(camera, renderer.domElement);
    transformControls.setSize(1);
    transformControls.setTranslationSnap(100);
    transformControls.setRotationSnap(THREE.MathUtils.degToRad(15));
    transformControls.setScaleSnap(0.1);
    
    transformControls.addEventListener('mouseDown', function() {
        // 在开始变换时保存状态
        saveState();
    });
    
    transformControls.addEventListener('dragging-changed', (event) => {
        controls.enabled = !event.value;
        isTransforming = event.value;
        
        if (!event.value && selectedObject) {
            // 在拖拽结束时更新物理体和重置状态
            updatePhysicsBody(selectedObject);
            transformControls.showX = true;
            transformControls.showY = true;
            transformControls.showZ = true;
        }
    });

    transformControls.addEventListener('objectChange', function() {
        if (selectedObject) {
            updateDimensions(selectedObject);
            updatePhysicsBody(selectedObject);
        }
    });

    transformControls.addEventListener('change', () => {
        if (selectedObject && !isTransforming) {
            // 只在非拖拽状态下重置轴的可见性
            transformControls.showX = true;
            transformControls.showY = true;
            transformControls.showZ = true;
        }
    });

    // 修改键盘事件监听器，添加 ESC 键处理
    window.addEventListener('keydown', (event) => {
        if (!selectedObject) return;
        
        switch (event.key.toLowerCase()) {
            case 'g':
                transformControls.setMode('translate');
                break;
            case 'r':
                transformControls.setMode('rotate');
                break;
            case 's':
                transformControls.setMode('scale');
                break;
            case 'escape':
                // 按下 ESC 键时，取消选择并关闭变换控制器
                selectObject(null);
                if (transformControls) {
                    transformControls.detach();
                    transformControls.enabled = false;
                }
                break;
        }
    });

    scene.add(transformControls);
}

// **保存状态的函数**
function saveState() {
    const state = {
        meshes: meshes.map(mesh => ({
            id: mesh.userData.id,
            position: mesh.position.clone(),
            rotation: mesh.rotation.clone(),
            scale: mesh.scale.clone(),
            geometry: mesh.geometry.clone(),
            material: mesh.material.clone()
        }))
    };
    
    undoStack.push(state);
    if (undoStack.length > MAX_HISTORY) {
        undoStack.shift();
    }
    redoStack = [];
}

// **撤销函数**
function undo() {
    if (undoStack.length === 0) return;
    
    // 保存当前状态到重做栈
    const currentState = {
        meshes: meshes.map(mesh => ({
            id: mesh.userData.id,
            position: mesh.position.clone(),
            rotation: mesh.rotation.clone(),
            scale: mesh.scale.clone(),
            geometry: mesh.geometry.clone(),
            material: mesh.material.clone()
        }))
    };
    redoStack.push(currentState);
    
    // 恢复上一个状态
    const previousState = undoStack.pop();
    restoreState(previousState);
}

// **重做函数**
function redo() {
    if (redoStack.length === 0) return;
    
    // 保存当前状态到撤销栈
    const currentState = {
        meshes: meshes.map(mesh => ({
            id: mesh.userData.id,
            position: mesh.position.clone(),
            rotation: mesh.rotation.clone(),
            scale: mesh.scale.clone(),
            geometry: mesh.geometry.clone(),
            material: mesh.material.clone()
        }))
    };
    undoStack.push(currentState);
    
    // 恢复下一个状态
    const nextState = redoStack.pop();
    restoreState(nextState);
}

// **添加 restoreState 函数**
function restoreState(state) {
    // 清除当前场景中的所有网格
    meshes.forEach(mesh => {
        scene.remove(mesh);
    });
    meshes = [];
    
    // 恢复状态中的网格
    state.meshes.forEach(meshState => {
        const geometry = meshState.geometry;
        const material = meshState.material;
        const mesh = new THREE.Mesh(geometry, material);
        
        mesh.position.copy(meshState.position);
        mesh.rotation.copy(meshState.rotation);
        mesh.scale.copy(meshState.scale);
        mesh.userData.id = meshState.id;
        
        scene.add(mesh);
        meshes.push(mesh);
        
        // 更新物理体
        updatePhysicsBody(mesh);
    });
    
    // 如果有选中的对象，更新变换控制器
    if (selectedObject) {
        const selectedId = selectedObject.userData.id;
        const newSelectedObject = meshes.find(mesh => mesh.userData.id === selectedId);
        if (newSelectedObject) {
            selectObject(newSelectedObject);
        } else {
            selectObject(null);
        }
    }
}

// **初始化**
init();
addTransformControls();
