import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls';
import useStore from '../store';

const DesignStudio = () => {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const transformControlsRef = useRef(null);
  const meshesRef = useRef([]);
  const selectedObjectRef = useRef(null);
  const { buildingData, updateBuildingData } = useStore();

  // 更新模型函数
  const updateModel = (data) => {
    if (!sceneRef.current) return;

    const scene = sceneRef.current;
    
    // 清除现有网格
    meshesRef.current.forEach(mesh => scene.remove(mesh));
    meshesRef.current = [];

    // 加载模型
    data.objects.forEach((obj, index) => {
      if (obj.geometry.vertices) {
        // 计算几何体的边界框
        const boundingBox = {
          min: new THREE.Vector3(Infinity, Infinity, Infinity),
          max: new THREE.Vector3(-Infinity, -Infinity, -Infinity)
        };
        
        // 找出边界框
        obj.geometry.vertices.forEach(vertex => {
          boundingBox.min.x = Math.min(boundingBox.min.x, vertex[0]);
          boundingBox.min.y = Math.min(boundingBox.min.y, vertex[2]);
          boundingBox.min.z = Math.min(boundingBox.min.z, vertex[1]);
          boundingBox.max.x = Math.max(boundingBox.max.x, vertex[0]);
          boundingBox.max.y = Math.max(boundingBox.max.y, vertex[2]);
          boundingBox.max.z = Math.max(boundingBox.max.z, vertex[1]);
        });
        
        // 计算中心点
        const center = new THREE.Vector3(
          (boundingBox.min.x + boundingBox.max.x) / 2,
          (boundingBox.min.y + boundingBox.max.y) / 2,
          (boundingBox.min.z + boundingBox.max.z) / 2
        );

        // 创建顶点
        const vertexArray = new Float32Array(
          obj.geometry.vertices.flatMap(vertex => [
            vertex[0] - center.x,
            vertex[2] - center.y,
            vertex[1] - center.z
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

        // 创建材质
        const material = new THREE.MeshPhongMaterial({
          transparent: obj.material.transparency > 0,
          opacity: 1 - obj.material.transparency,
          side: THREE.DoubleSide,
          roughness: obj.material.roughness || 0.5
        });

        // 加载纹理或设置颜色
        if (obj.material.texture) {
          const textureLoader = new THREE.TextureLoader();
          textureLoader.load(obj.material.texture, (texture) => {
            material.map = texture;
            material.needsUpdate = true;
          });
        } else {
          material.color = new THREE.Color(
            obj.material.color[0] / 255,
            obj.material.color[1] / 255,
            obj.material.color[2] / 255
          );
        }

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(center);
        mesh.userData.id = obj.id;
        mesh.userData.layer = obj.layer;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        scene.add(mesh);
        meshesRef.current.push(mesh);
      }
    });
  };

  // 加载和更新模型
  useEffect(() => {
    if (!sceneRef.current || !buildingData || !buildingData.building) return;

    const scene = sceneRef.current;
    
    // 清除现有对象
    scene.children = scene.children.filter(child => 
      child.type === 'GridHelper' || 
      child.type === 'TransformControls' || 
      child.type === 'DirectionalLight' || 
      child.type === 'AmbientLight'
    );

    // 创建材质
    const materials = {
      wall: new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        side: THREE.DoubleSide
      }),
      floor: new THREE.MeshStandardMaterial({
        color: 0xeeeeee,
        side: THREE.DoubleSide
      }),
      ceiling: new THREE.MeshStandardMaterial({
        color: 0xdddddd,
        side: THREE.DoubleSide
      })
    };

    // 创建房间布局
    const createRoom = (position, size, type) => {
      const { width, depth, height } = size;
      const { x, y, z } = position;

      // 创建地板
      const floorGeometry = new THREE.BoxGeometry(width, 1, depth);
      const floor = new THREE.Mesh(floorGeometry, materials.floor);
      floor.position.set(x, y, z);
      floor.receiveShadow = true;
      scene.add(floor);

      // 创建天花板
      const ceilingGeometry = new THREE.BoxGeometry(width, 1, depth);
      const ceiling = new THREE.Mesh(ceilingGeometry, materials.ceiling);
      ceiling.position.set(x, y + height, z);
      ceiling.castShadow = true;
      scene.add(ceiling);

      // 创建墙体
      const wallThickness = 20;
      const wallHeight = height;

      // 前墙
      const frontWallGeometry = new THREE.BoxGeometry(width, wallHeight, wallThickness);
      const frontWall = new THREE.Mesh(frontWallGeometry, materials.wall);
      frontWall.position.set(x, y + wallHeight/2, z + depth/2);
      frontWall.castShadow = true;
      frontWall.receiveShadow = true;
      scene.add(frontWall);

      // 后墙
      const backWallGeometry = new THREE.BoxGeometry(width, wallHeight, wallThickness);
      const backWall = new THREE.Mesh(backWallGeometry, materials.wall);
      backWall.position.set(x, y + wallHeight/2, z - depth/2);
      backWall.castShadow = true;
      backWall.receiveShadow = true;
      scene.add(backWall);

      // 左墙
      const leftWallGeometry = new THREE.BoxGeometry(wallThickness, wallHeight, depth);
      const leftWall = new THREE.Mesh(leftWallGeometry, materials.wall);
      leftWall.position.set(x - width/2, y + wallHeight/2, z);
      leftWall.castShadow = true;
      leftWall.receiveShadow = true;
      scene.add(leftWall);

      // 右墙
      const rightWallGeometry = new THREE.BoxGeometry(wallThickness, wallHeight, depth);
      const rightWall = new THREE.Mesh(rightWallGeometry, materials.wall);
      rightWall.position.set(x + width/2, y + wallHeight/2, z);
      rightWall.castShadow = true;
      rightWall.receiveShadow = true;
      scene.add(rightWall);

      // 为每个墙体添加用户数据
      [floor, ceiling, frontWall, backWall, leftWall, rightWall].forEach(wall => {
        wall.userData = {
          id: `${type}-${Math.random().toString(36).substr(2, 9)}`,
          type: type,
          layer: 1
        };
      });
    };

    // 根据buildingData创建房间
    const standardRoomHeight = buildingData.building.floor_height || 3000; // 使用配置文件中的高度
    const standardRoomWidth = 6000;  // 标准房间宽度
    const standardRoomDepth = 4000;  // 标准房间深度
    const corridorWidth = 1500;      // 走廊宽度
    const wallThickness = buildingData.building.wall_thickness || 150; // 使用配置文件中的墙体厚度

    // 创建客厅
    createRoom(
      { x: 0, y: 0, z: 0 },
      { width: standardRoomWidth * 2, depth: standardRoomDepth * 2, height: standardRoomHeight },
      'living-room'
    );

    // 根据卧室数量创建卧室
    const bedroomCount = buildingData.building.bedrooms || 0;
    if (bedroomCount > 0) {
      // 计算卧室布局
      const bedroomsPerRow = Math.ceil(bedroomCount / 2);
      const totalWidth = (standardRoomWidth * bedroomsPerRow) + 
                        (corridorWidth * (bedroomsPerRow - 1)) + 
                        (wallThickness * bedroomsPerRow);

      // 创建卧室
      for (let i = 0; i < bedroomCount; i++) {
        const row = Math.floor(i / 2);
        const col = i % 2;
        const x = (col === 0 ? -totalWidth/2 : totalWidth/2) + 
                 (col === 0 ? standardRoomWidth/2 : -standardRoomWidth/2);
        const z = (row * (standardRoomDepth + corridorWidth + wallThickness)) - 
                 (standardRoomDepth * (bedroomsPerRow - 1) / 2);

        createRoom(
          { x, y: 0, z },
          { width: standardRoomWidth, depth: standardRoomDepth, height: standardRoomHeight },
          'bedroom'
        );
      }
    }
  }, [buildingData]);

  // 监听 buildingData 变化
  useEffect(() => {
    if (buildingData) {
      updateModel(buildingData);
    }
  }, [buildingData]);

  useEffect(() => {
    if (!containerRef.current) return;

    // 初始化场景
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    sceneRef.current = scene;

    // 初始化相机
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth * 0.8 / window.innerHeight,
      0.1,
      50000
    );
    camera.position.set(15000, 15000, 15000);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // 初始化渲染器
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth * 0.8, window.innerHeight);
    renderer.shadowMap.enabled = true;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 添加光源
    const ambientLight = new THREE.AmbientLight(0x404040, 2);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
    directionalLight.position.set(10000, 20000, 10000);
    scene.add(directionalLight);

    // 添加网格
    const gridHelper = new THREE.GridHelper(30000, 30);
    scene.add(gridHelper);

    // 初始化控制器
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.mouseButtons = {
      LEFT: null,
      MIDDLE: null,
      RIGHT: THREE.MOUSE.ROTATE
    };
    controls.enablePan = true;
    controls.enableZoom = true;
    controls.panButton = THREE.MOUSE.MIDDLE;
    controlsRef.current = controls;

    // 初始化变换控制器
    const transformControls = new TransformControls(camera, renderer.domElement);
    transformControls.setSize(1);
    transformControls.setTranslationSnap(100);
    transformControls.setRotationSnap(THREE.MathUtils.degToRad(15));
    transformControls.setScaleSnap(0.1);
    scene.add(transformControls);
    transformControlsRef.current = transformControls;

    // 加载初始模型
    fetch('/building.json')
      .then(response => response.json())
      .then(jsonModel => {
        updateBuildingData(jsonModel);
      })
      .catch(error => console.error('Error loading model:', error));

    // 动画循环
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // 窗口大小调整
    const handleResize = () => {
      if (!camera || !renderer) return;
      camera.aspect = window.innerWidth * 0.8 / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth * 0.8, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    // 清理函数
    const container = containerRef.current;
    return () => {
      window.removeEventListener('resize', handleResize);
      if (container) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [updateBuildingData]);

  // 添加键盘快捷键支持
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!selectedObjectRef.current || !transformControlsRef.current) return;
      
      switch (event.key.toLowerCase()) {
        case 'g':
          transformControlsRef.current.setMode('translate');
          break;
        case 'r':
          transformControlsRef.current.setMode('rotate');
          break;
        case 's':
          transformControlsRef.current.setMode('scale');
          break;
        case 'escape':
          if (selectedObjectRef.current) {
            selectedObjectRef.current.material.emissive.setHex(0x000000);
            selectedObjectRef.current = null;
            transformControlsRef.current.detach();
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div 
      ref={containerRef} 
      className="w-full h-full"
      onMouseDown={(e) => {
        if (e.button === 0) { // 左键点击
          const raycaster = new THREE.Raycaster();
          const mouse = new THREE.Vector2();
          const rect = rendererRef.current.domElement.getBoundingClientRect();
          
          mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          
          raycaster.setFromCamera(mouse, cameraRef.current);
          const intersects = raycaster.intersectObjects(meshesRef.current);
          
          if (intersects.length > 0) {
            const object = intersects[0].object;
            if (selectedObjectRef.current !== object) {
              if (selectedObjectRef.current) {
                selectedObjectRef.current.material.emissive.setHex(0x000000);
              }
              selectedObjectRef.current = object;
              object.material.emissive.setHex(0x333333);
              transformControlsRef.current.attach(object);
            }
          } else {
            if (selectedObjectRef.current) {
              selectedObjectRef.current.material.emissive.setHex(0x000000);
              selectedObjectRef.current = null;
              transformControlsRef.current.detach();
            }
          }
        }
      }}
    />
  );
};

export default DesignStudio; 