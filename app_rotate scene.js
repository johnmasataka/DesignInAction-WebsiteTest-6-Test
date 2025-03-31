import * as THREE from 'https://unpkg.com/three@0.126.1/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.126.1/examples/jsm/controls/OrbitControls.js';

let jsonModel;
let scene, camera, renderer, controls;

async function loadJSON() {
    const response = await fetch("building.json");
    jsonModel = await response.json();
}

async function init() {
    await loadJSON();

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 50000);
    camera.position.set(15000, 10000, 15000);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth * 0.7, window.innerHeight);
    document.getElementById("viewer").appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    
    scene.add(new THREE.AmbientLight(0x404040, 1));
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(10000, 20000, 10000);
    scene.add(directionalLight);

    // Rotate scene 90 degrees around Y axis
    scene.rotation.x = Math.PI / -2;
    
    loadModel();
    animate();
}

function loadModel() {
    scene.children = scene.children.filter(child => !child.isMesh);

    const building = jsonModel.building;
    const floorHeight = building.floor_height;
    const floors = building.floors;

    jsonModel.objects.forEach(obj => {
        // **跳过无效对象**
        if (!obj.bounding_box || !obj.geometry || !obj.geometry.faces) {
            console.warn(`⚠️ Warning: ${obj.id} 没有完整数据，跳过处理`);
            return;
        }

        for (let i = 0; i < floors; i++) {
            const min = obj.bounding_box.min;
            const max = obj.bounding_box.max;

            let correctedMin, correctedMax;

            if (obj.layer === "Floor") {
                correctedMin = [...min];
                correctedMax = [...max];

                // **确保地板的 Y 轴是高度**
                correctedMin[1] = i * floorHeight;
                correctedMax[1] = i * floorHeight;
            } else {
                // **正确调整墙体，使其随楼层增加高度，而不是变长**
                correctedMin = [min[0], min[1], min[2] + i * floorHeight];
                correctedMax = [max[0], max[1], max[2] + i * floorHeight];
            }

            const vertices = new Float32Array([
                correctedMin[0], correctedMin[1], correctedMin[2],  correctedMax[0], correctedMin[1], correctedMin[2],
                correctedMax[0], correctedMax[1], correctedMin[2],  correctedMin[0], correctedMax[1], correctedMin[2],
                correctedMin[0], correctedMin[1], correctedMax[2],  correctedMax[0], correctedMin[1], correctedMax[2],
                correctedMax[0], correctedMax[1], correctedMax[2],  correctedMin[0], correctedMax[1], correctedMax[2]
            ]);

            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

            let faces = [];
            obj.geometry.faces.forEach(face => {
                if (face.length === 4) {
                    faces.push(face[0], face[1], face[2]);
                    faces.push(face[2], face[3], face[0]);
                } else {
                    faces.push(...face);
                }
            });

            geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(faces), 1));
            geometry.computeVertexNormals();

            let material;
            if (obj.material.texture) {
                const texture = new THREE.TextureLoader().load(obj.material.texture);
                material = new THREE.MeshStandardMaterial({
                    map: texture,
                    transparent: obj.material.transparency > 0,
                    opacity: 1 - obj.material.transparency,
                    roughness: obj.material.roughness,
                    side: THREE.DoubleSide
                });
            } else {
                material = new THREE.MeshStandardMaterial({
                    color: new THREE.Color(obj.material.color[0] / 255, obj.material.color[1] / 255, obj.material.color[2] / 255),
                    roughness: obj.material.roughness,
                    transparent: obj.material.transparency > 0,
                    opacity: 1 - obj.material.transparency,
                    side: THREE.DoubleSide
                });
            }

            const mesh = new THREE.Mesh(geometry, material);
            scene.add(mesh);
        }
    });
}

// **监听 slider bar 变化**
document.getElementById("confirmFloors").addEventListener("click", () => {
    jsonModel.building.floors = parseInt(document.getElementById("floors").value);
    loadModel();
});

// **Three.js 渲染循环**
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

init();
