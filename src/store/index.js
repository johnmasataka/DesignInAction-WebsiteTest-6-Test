import { create } from 'zustand';

const useStore = create((set) => ({
  // 建筑数据
  buildingData: {
    building: {
      width: 12000,
      depth: 8000,
      floor_height: 2500,
      wall_thickness: 150,
      floors: 1
    },
    objects: []
  },
  updateBuildingData: (newData) => set({ buildingData: newData }),

  // 聊天历史
  chatHistory: [],
  addChatMessage: (message) => 
    set((state) => ({ 
      chatHistory: [...state.chatHistory, message] 
    })),

  // 设计步骤
  currentStep: 1,
  updateStep: (step) => set({ currentStep: step }),

  // 选中的对象
  selectedObject: null,
  setSelectedObject: (object) => set({ selectedObject: object }),

  // 更新对象
  updateObject: (objectId, updates) =>
    set((state) => {
      const newObjects = state.buildingData.objects.map((obj) =>
        obj.id === objectId ? { ...obj, ...updates } : obj
      );
      return {
        buildingData: {
          ...state.buildingData,
          objects: newObjects,
        },
      };
    }),
}));

export default useStore; 