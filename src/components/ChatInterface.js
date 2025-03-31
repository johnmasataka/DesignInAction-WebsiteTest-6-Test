import React, { useState, useEffect } from 'react';
import useStore from '../store';
import './ChatInterface.css';

const ChatInterface = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [currentValue, setCurrentValue] = useState(1);
  const [chatHistory, setChatHistory] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const { buildingData, updateBuildingData } = useStore();

  const steps = [
    {
      prompt: "Let's start designing your building. First, please select the number of floors (1-10):",
      property: "floors",
      type: "range",
      min: 1,
      max: 10,
      systemPrompt: "You are an architectural design assistant. The user has selected {value} floors for their building. Provide a brief, professional response about this choice and its implications for the design."
    },
    {
      prompt: "Next, please select the number of bedrooms (1-6):",
      property: "bedrooms",
      type: "range",
      min: 1,
      max: 6,
      systemPrompt: "You are an architectural design assistant. The user wants {value} bedrooms in their building. Provide a brief, professional response about this choice and suggest optimal layouts or considerations."
    },
    {
      prompt: "Now, please select the ceiling height (meters):",
      property: "floor_height",
      type: "range",
      min: 2000,
      max: 4000,
      step: 100,
      systemPrompt: "You are an architectural design assistant. The user has chosen a ceiling height of {value} millimeters. Provide a brief, professional response about this choice and its impact on spatial quality and energy efficiency."
    },
    {
      prompt: "Finally, please select the roof style:",
      property: "roof_style",
      type: "select",
      options: ["flat", "gable", "hip"],
      systemPrompt: "You are an architectural design assistant. The user has selected a {value} roof style. Provide a brief, professional response about this choice and its advantages for their building design."
    }
  ];

  const generateChatResponse = async (value, step) => {
    try {
      console.log('\n=== Frontend: Preparing ChatGPT Request ===');
      console.log('System Prompt:', step.systemPrompt.replace('{value}', value));
      console.log('User Message:', `I have selected ${value} for my building's ${step.property}`);
      console.log('Current Building Data:', buildingData);
      console.log('====================================\n');

      const response = await fetch('http://localhost:3001/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          systemPrompt: step.systemPrompt.replace('{value}', value),
          userMessage: `I have selected ${value} for my building's ${step.property}.`
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      console.log('\n=== Frontend: Received ChatGPT Response ===');
      console.log('Response:', data.response);
      console.log('====================================\n');

      return data.response;
    } catch (error) {
      console.error('Error generating chat response:', error);
      return 'Sorry, I encountered an error while processing your request.';
    }
  };

  const handleValueChange = async (value) => {
    setCurrentValue(value);
    setIsProcessing(true);

    // Update building data
    const updatedData = {
      ...buildingData,
      building: {
        ...buildingData.building,
        [steps[currentStep].property]: value
      }
    };

    // Update object list
    if (steps[currentStep].property === "floors") {
      const floorHeight = buildingData.building.floor_height;
      const wallThickness = buildingData.building.wall_thickness;
      const width = buildingData.building.width;
      const depth = buildingData.building.depth;

      // Update all wall heights
      updatedData.objects = updatedData.objects.map(obj => {
        if (obj.layer === "Walls") {
          return {
            ...obj,
            bounding_box: {
              ...obj.bounding_box,
              max: [obj.bounding_box.max[0], obj.bounding_box.max[1], floorHeight * value]
            },
            geometry: {
              ...obj.geometry,
              vertices: obj.geometry.vertices.map(vertex => {
                if (vertex[2] === floorHeight) {
                  return [vertex[0], vertex[1], floorHeight * value];
                }
                return vertex;
              })
            }
          };
        }
        if (obj.layer === "Roof") {
          return {
            ...obj,
            bounding_box: {
              ...obj.bounding_box,
              min: [obj.bounding_box.min[0], obj.bounding_box.min[1], floorHeight * value],
              max: [obj.bounding_box.max[0], obj.bounding_box.max[1], floorHeight * value + 100]
            },
            geometry: {
              ...obj.geometry,
              vertices: obj.geometry.vertices.map(vertex => {
                if (vertex[2] === floorHeight) {
                  return [vertex[0], vertex[1], floorHeight * value];
                }
                if (vertex[2] === floorHeight + 100) {
                  return [vertex[0], vertex[1], floorHeight * value + 100];
                }
                return vertex;
              })
            }
          };
        }
        return obj;
      });
    } else if (steps[currentStep].property === "bedrooms") {
      // Filter bedroom objects based on selected count
      updatedData.objects = updatedData.objects.filter(obj => 
        obj.layer !== "Bedrooms" || 
        parseInt(obj.id.split('-')[1]) <= value
      );

      // Update building dimensions based on bedroom count
      const bedroomWidth = 6000; // Standard bedroom width
      const bedroomDepth = 4000; // Standard bedroom depth
      const corridorWidth = 1500; // Corridor width
      const wallThickness = 150; // Wall thickness
      const newWidth = value <= 2 ? 12000 : bedroomWidth * value + corridorWidth;
      const newDepth = 8000; // Keep constant depth for two rows

      // Update building dimensions
      updatedData.building.width = newWidth;
      updatedData.building.depth = newDepth;

      // Update outer walls based on new dimensions
      updatedData.objects = updatedData.objects.map(obj => {
        if (obj.layer === "Walls") {
          if (obj.id === "wall-001" || obj.id === "wall-002") {
            return {
              ...obj,
              bounding_box: {
                ...obj.bounding_box,
                max: [newWidth, obj.bounding_box.max[1], obj.bounding_box.max[2]]
              },
              geometry: {
                ...obj.geometry,
                vertices: obj.geometry.vertices.map(vertex => {
                  if (vertex[0] === buildingData.building.width) {
                    return [newWidth, vertex[1], vertex[2]];
                  }
                  return vertex;
                })
              }
            };
          }
          if (obj.id === "wall-004") {
            return {
              ...obj,
              bounding_box: {
                ...obj.bounding_box,
                min: [newWidth - wallThickness, obj.bounding_box.min[1], obj.bounding_box.min[2]],
                max: [newWidth, obj.bounding_box.max[1], obj.bounding_box.max[2]]
              },
              geometry: {
                ...obj.geometry,
                vertices: obj.geometry.vertices.map(vertex => {
                  if (vertex[0] === buildingData.building.width - wallThickness) {
                    return [newWidth - wallThickness, vertex[1], vertex[2]];
                  }
                  if (vertex[0] === buildingData.building.width) {
                    return [newWidth, vertex[1], vertex[2]];
                  }
                  return vertex;
                })
              }
            };
          }

        }
        if (obj.layer === "Roof") {
          return {
            ...obj,
            bounding_box: {
              ...obj.bounding_box,
              max: [newWidth, obj.bounding_box.max[1], obj.bounding_box.max[2]]
            },
            geometry: {
              ...obj.geometry,
              vertices: obj.geometry.vertices.map(vertex => {
                if (vertex[0] === buildingData.building.width) {
                  return [newWidth, vertex[1], vertex[2]];
                }
                return vertex;
              })
            }
          };
        }
        return obj;
      });
    } else if (steps[currentStep].property === "floor_height") {
      const floorHeight = value;
      const numFloors = buildingData.building.floors;

      // Update all wall heights
      updatedData.objects = updatedData.objects.map(obj => {
        if (obj.layer === "Walls") {
          return {
            ...obj,
            bounding_box: {
              ...obj.bounding_box,
              max: [obj.bounding_box.max[0], obj.bounding_box.max[1], floorHeight * numFloors]
            },
            geometry: {
              ...obj.geometry,
              vertices: obj.geometry.vertices.map(vertex => {
                if (vertex[2] === buildingData.building.floor_height) {
                  return [vertex[0], vertex[1], floorHeight];
                }
                if (vertex[2] === buildingData.building.floor_height * numFloors) {
                  return [vertex[0], vertex[1], floorHeight * numFloors];
                }
                return vertex;
              })
            }
          };
        }
        if (obj.layer === "Roof") {
          return {
            ...obj,
            bounding_box: {
              ...obj.bounding_box,
              min: [obj.bounding_box.min[0], obj.bounding_box.min[1], floorHeight * numFloors],
              max: [obj.bounding_box.max[0], obj.bounding_box.max[1], floorHeight * numFloors + 100]
            },
            geometry: {
              ...obj.geometry,
              vertices: obj.geometry.vertices.map(vertex => {
                if (vertex[2] === buildingData.building.floor_height) {
                  return [vertex[0], vertex[1], floorHeight];
                }
                if (vertex[2] === buildingData.building.floor_height * numFloors) {
                  return [vertex[0], vertex[1], floorHeight * numFloors];
                }
                if (vertex[2] === buildingData.building.floor_height * numFloors + 100) {
                  return [vertex[0], vertex[1], floorHeight * numFloors + 100];
                }
                return vertex;
              })
            }
          };
        }
        return obj;
      });
    } else if (steps[currentStep].property === "roof_style") {
      // Update roof style
      updatedData.objects = updatedData.objects.map(obj => {
        if (obj.layer === "Roof") {
          return {
            ...obj,
            material: {
              ...obj.material,
              name: value === "flat" ? "Flat Roof" : value === "gable" ? "Gable Roof" : "Hip Roof"
            }
          };
        }
        return obj;
      });
    }

    updateBuildingData(updatedData);

    // Print updated JSON data to console
    console.log('Updated Building Data:', JSON.stringify(updatedData, null, 2));

    // Add user message to chat history
    setChatHistory(prev => [...prev, { type: 'user', content: `${value}` }]);

    // Generate chat response
    const response = await generateChatResponse(value, steps[currentStep]);
    
    // Add assistant's response to chat history
    setChatHistory(prev => [...prev, { type: 'assistant', content: response }]);

    setIsProcessing(false);
    
    // Move to next step if not on the last step
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
      setCurrentValue(1);
    }
  };

  const startDesignProcess = () => {
    setCurrentStep(0);
    setCurrentValue(1);
    setChatHistory([]);
    setIsProcessing(false);
  };

  useEffect(() => {
    startDesignProcess();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {chatHistory.map((message, index) => (
          <div
            key={index}
            className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg p-3 ${
                message.type === 'user'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-800'
              }`}
            >
              {message.content}
            </div>
          </div>
        ))}
        {isProcessing && (
          <div className="flex justify-start">
            <div className="bg-gray-200 text-gray-800 rounded-lg p-3">
              <div className="animate-pulse">Thinking...</div>
            </div>
          </div>
        )}
      </div>
      <div className="p-4 border-t">
        {currentStep < steps.length ? (
          <div className="space-y-4">
            <div className="text-gray-800">{steps[currentStep].prompt}</div>
            {steps[currentStep].type === "range" && (
              <div className="space-y-2">
                <input
                  type="range"
                  min={steps[currentStep].min}
                  max={steps[currentStep].max}
                  step={steps[currentStep].step || 1}
                  value={currentValue}
                  onChange={(e) => handleValueChange(Number(e.target.value))}
                  className="w-full"
                />
                <div className="text-center text-gray-600">{currentValue}</div>
              </div>
            )}
            {steps[currentStep].type === "select" && (
              <div className="grid grid-cols-3 gap-2">
                {steps[currentStep].options.map((option) => (
                  <button
                    key={option}
                    onClick={() => handleValueChange(option)}
                    className={`p-2 rounded ${
                      currentValue === option
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-200 text-gray-800'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center">
            <div className="text-gray-800 mb-4">Design Complete!</div>
            <button
              onClick={() => {
                setCurrentStep(0);
                setCurrentValue(1);
                setChatHistory([]);
              }}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            >
              Start Over
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatInterface; 