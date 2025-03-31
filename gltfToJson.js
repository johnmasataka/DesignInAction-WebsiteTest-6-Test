import * as THREE from 'https://unpkg.com/three@0.126.1/build/three.module.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.126.1/examples/jsm/loaders/GLTFLoader.js';

async function convertGLTFtoJSON(gltfPath) {
    const loader = new GLTFLoader();
    
    try {
        const gltf = await new Promise((resolve, reject) => {
            loader.load(gltfPath, resolve, undefined, reject);
        });

        const jsonModel = {
            building: {
                width: 12000,  // 保持与building.json相同的默认值
                depth: 8000,
                floor_height: 2500,
                wall_thickness: 150,
                floors: 1
            },
            objects: []
        };

        // 遍历场景中的所有对象
        gltf.scene.traverse((node) => {
            if (node.isMesh) {
                const geometry = node.geometry;
                const material = node.material;
                
                // 获取边界框
                const bbox = new THREE.Box3().setFromObject(node);
                
                // 创建顶点数组
                const vertices = [];
                const position = geometry.attributes.position;
                for (let i = 0; i < position.count; i++) {
                    vertices.push([
                        position.getX(i),
                        position.getY(i),
                        position.getZ(i)
                    ]);
                }

                // 创建面数组
                const faces = [];
                const index = geometry.index;
                if (index) {
                    for (let i = 0; i < index.count; i += 3) {
                        faces.push([
                            index.getX(i),
                            index.getX(i + 1),
                            index.getX(i + 2)
                        ]);
                    }
                }

                // 创建对象
                const object = {
                    id: node.name || `mesh-${jsonModel.objects.length + 1}`,
                    type: "Mesh",
                    layer: node.userData.layer || "Default",
                    bounding_box: {
                        min: [bbox.min.x, bbox.min.y, bbox.min.z],
                        max: [bbox.max.x, bbox.max.y, bbox.max.z]
                    },
                    geometry: {
                        vertices: vertices,
                        faces: faces
                    },
                    material: {
                        name: material.name || "Default",
                        color: material.color ? [
                            material.color.r * 255,
                            material.color.g * 255,
                            material.color.b * 255
                        ] : [200, 200, 200],
                        transparency: material.transparent ? material.opacity : 0,
                        roughness: material.roughness || 0.5
                    },
                    transform: {
                        position: [node.position.x, node.position.y, node.position.z],
                        rotation: [node.rotation.x, node.rotation.y, node.rotation.z],
                        scale: [node.scale.x, node.scale.y, node.scale.z]
                    }
                };

                jsonModel.objects.push(object);
            }
        });

        return jsonModel;
    } catch (error) {
        console.error('Error converting GLTF to JSON:', error);
        throw error;
    }
}

// 导出函数供其他文件使用
window.convertGLTFtoJSON = convertGLTFtoJSON; 