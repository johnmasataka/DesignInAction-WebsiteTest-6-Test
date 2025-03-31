import * as THREE from 'https://unpkg.com/three@0.126.1/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.126.1/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'https://unpkg.com/three@0.126.1/examples/jsm/controls/TransformControls.js';
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

// **加载 JSON 文件**
async function loadJSON() {
    try {
        // 尝试加载house.json
        console.log("Attempting to load house.json...");
        const response = await fetch("house.json");
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        jsonModel = await response.json();
        console.log("Successfully loaded house.json:", jsonModel);
        
        // 检查模型结构
        if (!jsonModel.objects || !Array.isArray(jsonModel.objects)) {
            throw new Error("Invalid model structure: missing or invalid objects array");
        }
        console.log(`Model contains ${jsonModel.objects.length} objects`);
        
        // 检查每个对象的必要属性
        jsonModel.objects.forEach((obj, index) => {
            if (!obj.geometry || !obj.geometry.vertices || !obj.geometry.faces) {
                console.warn(`Object ${index} (${obj.id}) is missing required geometry properties`);
            }
        });
    } catch (error) {
        // 如果house.json不存在或加载失败，则加载building.json
        console.log("Error loading house.json, falling back to building.json:", error);
        try {
            const response = await fetch("building.json");
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            jsonModel = await response.json();
            console.log("Successfully loaded building.json");
        } catch (fallbackError) {
            console.error("Failed to load both house.json and building.json:", fallbackError);
            throw fallbackError;
        }
    }
}

// **初始化 Three.js 场景**
async function init() {
    await loadJSON();

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    
    camera = new THREE.PerspectiveCamera(75, window.innerWidth * 0.8 / window.innerHeight, 0.1, 5000000);
    camera.position.set(-50, 10, -50);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth * 0.8, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.getElementById('viewer').appendChild(renderer.domElement);
    
    // 添加光源
    const ambientLight = new THREE.AmbientLight(0x404040, 2);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(10, 20, 10); // 将光源位置再缩小10倍
    scene.add(directionalLight);
    
    // 添加网格
    const gridHelper = new THREE.GridHelper(200, 200); // Reduce grid size by 10x
    scene.add(gridHelper);
    
    // 初始化物理世界
    initPhysics();
    
    // 初始化控制器
    controls = new OrbitControls(camera, renderer.domElement);
    controls.mouseButtons = {
        LEFT: null,
        MIDDLE: null,
        RIGHT: THREE.MOUSE.ROTATE  // Change rotation to right mouse button
    };
    controls.enablePan = true;  // Enable panning
    controls.enableZoom = true;  // Enable zooming
    controls.panButton = THREE.MOUSE.MIDDLE;  // Middle button for panning
    controls.zoomSpeed = 2.0;  // Increase zoom speed
    controls.rotateSpeed = 0.5;  // Decrease rotation speed
    initTransformControls();

    // Add click event listeners
    renderer.domElement.addEventListener('click', onObjectClick);
    renderer.domElement.addEventListener('click', onFaceClick);

    // Add new global keyboard event listener
    window.addEventListener('keydown', function(event) {
        // Ctrl + Z: Undo
        if (event.ctrlKey && !event.shiftKey && event.key.toLowerCase() === 'z') {
            event.preventDefault();
            undo();
            return;
        }
        // Ctrl + Shift + Z: Redo
        if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'z') {
            event.preventDefault();
            redo();
            return;
        }
    });

    // Load model
    loadModel();
    
    // Initialize other functions
    initDragAndDrop();
    initObjectSelection();
    dimensionsPanel = document.getElementById('dimensions-panel');
    
    animate();

    // Add transform control button event listeners
    document.querySelector('[data-control="translate"]').addEventListener('click', () => {
        if (transformControls && selectedObject) {
            transformControls.setMode('translate');
            transformControls.showX = true;
            transformControls.showY = true;
            transformControls.showZ = true;
        }
    });

    document.querySelector('[data-control="rotate"]').addEventListener('click', () => {
        if (transformControls && selectedObject) {
            transformControls.setMode('rotate');
            transformControls.showX = true;
            transformControls.showY = true;
            transformControls.showZ = true;
        }
    });

    document.querySelector('[data-control="scale"]').addEventListener('click', () => {
        if (transformControls && selectedObject) {
            transformControls.setMode('scale');
            transformControls.showX = true;
            transformControls.showY = true;
            transformControls.showZ = true;
        }
    });

    document.querySelector('[data-control="xy"]').addEventListener('click', () => {
        if (transformControls && selectedObject) {
            transformControls.setMode('translate');
            transformControls.showX = true;
            transformControls.showY = true;
            transformControls.showZ = false;
        }
    });

    document.querySelector('[data-control="yz"]').addEventListener('click', () => {
        if (transformControls && selectedObject) {
            transformControls.setMode('translate');
            transformControls.showY = true;
            transformControls.showZ = true;
            transformControls.showX = false;
        }
    });

    document.querySelector('[data-control="xz"]').addEventListener('click', () => {
        if (transformControls && selectedObject) {
            transformControls.setMode('translate');
            transformControls.showX = true;
            transformControls.showZ = true;
            transformControls.showY = false;
        }
    });

    // Add material control event listeners
    document.getElementById('material-color').addEventListener('input', (e) => {
        if (selectedObject) {
            const color = new THREE.Color(e.target.value);
            if (Array.isArray(selectedObject.material)) {
                selectedObject.material.forEach(mat => {
                    if (mat) {
                        mat.color = color;
                    }
                });
            } else if (selectedObject.material) {
                selectedObject.material.color = color;
            }
        }
    });

    document.getElementById('material-opacity').addEventListener('input', (e) => {
        if (selectedObject) {
            const opacity = e.target.value / 100;
            if (Array.isArray(selectedObject.material)) {
                selectedObject.material.forEach(mat => {
                    if (mat) {
                        mat.opacity = opacity;
                    }
                });
            } else if (selectedObject.material) {
                selectedObject.material.opacity = opacity;
            }
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

// **修改 loadModel 函数**
function loadModel() {
    console.log("Starting to load model...");
    scene.children = scene.children.filter(child => 
        !child.isMesh && !(child instanceof TransformControls)
    );

    const building = jsonModel.building;
    const floorHeight = building.floor_height;
    const floors = building.floors;

    console.log("Processing objects...");
    jsonModel.objects.forEach((obj, index) => {
        console.log(`Processing object ${index}:`, obj.id);
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
            
            console.log(`Object ${obj.id} bounding box:`, boundingBox);
            
            // 计算中心点
            const center = new THREE.Vector3(
                (boundingBox.min.x + boundingBox.max.x) / 2,
                (boundingBox.min.y + boundingBox.max.y) / 2,
                (boundingBox.min.z + boundingBox.max.z) / 2
            );
            console.log(`Object ${obj.id} center:`, center);

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
                    // 对于四边形，使用三角形扇，并翻转法线
                    indices.push(face[0], face[2], face[1]);
                    indices.push(face[0], face[3], face[2]);
                } else {
                    // 对于三角形，翻转法线
                    indices.push(face[0], face[2], face[1]);
                }
            });

            geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(indices), 1));
            geometry.computeVertexNormals();
            
            // 翻转所有法线
            const normals = geometry.attributes.normal.array;
            for (let i = 0; i < normals.length; i++) {
                normals[i] = -normals[i];
            }
            geometry.attributes.normal.needsUpdate = true;

            // 创建材质
            const material = new THREE.MeshPhongMaterial({
                color: new THREE.Color(
                    obj.material.color[0] / 255,
                    obj.material.color[1] / 255,
                    obj.material.color[2] / 255
                ),
                transparent: true,  // 始终启用透明度
                opacity: obj.material.transparency || 0.9,  // 如果没有透明度值，默认设置为0.3
                side: THREE.DoubleSide  // 双面渲染
            });

            const mesh = new THREE.Mesh(geometry, material);
            
            // 将网格位置设置为计算出的中心点
            mesh.position.copy(center);
            
            mesh.userData.id = obj.id;
            mesh.userData.layer = obj.layer;
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            scene.add(mesh);
            meshes.push(mesh);
            console.log(`Successfully added mesh ${obj.id} to scene at position:`, mesh.position);

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
            console.log(`Successfully added physics body for ${obj.id}`);
        }
    });

    console.log("Model loading completed");
    console.log(`Total meshes: ${meshes.length}`);
    console.log(`Total physics bodies: ${bodies.length}`);
    
    // 输出场景中所有对象的位置
    scene.traverse((object) => {
        if (object.isMesh) {
            console.log(`Mesh ${object.name} position:`, object.position);
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
    const defaultSize = 1; // 将默认大小再缩小10倍
    
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

        // Update material control panel
        const colorPicker = document.getElementById('material-color');
        const opacitySlider = document.getElementById('material-opacity');
        
        if (Array.isArray(selectedObject.material)) {
            colorPicker.value = '#' + selectedObject.material[0].color.getHexString();
            opacitySlider.value = selectedObject.material[0].opacity * 100;
        } else if (selectedObject.material) {
            colorPicker.value = '#' + selectedObject.material.color.getHexString();
            opacitySlider.value = selectedObject.material.opacity * 100;
        }
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
    transformControls.setTranslationSnap(0.1);
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
