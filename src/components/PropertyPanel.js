import React from 'react';
import useStore from '../store';
import './PropertyPanel.css';

const PropertyPanel = () => {
  const { selectedObject, buildingData, updateObject } = useStore();

  if (!selectedObject || !buildingData) {
    return (
      <div className="property-panel">
        <h2>Properties</h2>
        <p className="empty-state">Select an object to view its properties</p>
      </div>
    );
  }

  const object = buildingData.objects.find(obj => obj.id === selectedObject.id);

  const handlePropertyChange = (property, value) => {
    updateObject(selectedObject.id, {
      [property]: value
    });
  };

  return (
    <div className="property-panel">
      <h2>Properties</h2>
      
      <div className="space-y-4">
        {/* 位置 */}
        <div className="property-group">
          <h3>Position</h3>
          <div className="property-grid">
            {['x', 'y', 'z'].map(axis => (
              <input
                key={axis}
                type="number"
                value={object.transform.position[axis]}
                onChange={(e) => {
                  const newPosition = [...object.transform.position];
                  newPosition[axis] = parseFloat(e.target.value);
                  handlePropertyChange('transform', {
                    ...object.transform,
                    position: newPosition
                  });
                }}
                className="property-input"
              />
            ))}
          </div>
        </div>

        {/* 旋转 */}
        <div className="property-group">
          <h3>Rotation</h3>
          <div className="property-grid">
            {['x', 'y', 'z'].map(axis => (
              <input
                key={axis}
                type="number"
                value={object.transform.rotation[axis]}
                onChange={(e) => {
                  const newRotation = [...object.transform.rotation];
                  newRotation[axis] = parseFloat(e.target.value);
                  handlePropertyChange('transform', {
                    ...object.transform,
                    rotation: newRotation
                  });
                }}
                className="property-input"
              />
            ))}
          </div>
        </div>

        {/* 缩放 */}
        <div className="property-group">
          <h3>Scale</h3>
          <div className="property-grid">
            {['x', 'y', 'z'].map(axis => (
              <input
                key={axis}
                type="number"
                value={object.transform.scale[axis]}
                onChange={(e) => {
                  const newScale = [...object.transform.scale];
                  newScale[axis] = parseFloat(e.target.value);
                  handlePropertyChange('transform', {
                    ...object.transform,
                    scale: newScale
                  });
                }}
                className="property-input"
              />
            ))}
          </div>
        </div>

        {/* 材质 */}
        <div className="property-group">
          <h3>Material</h3>
          <div className="mt-1">
            <input
              type="color"
              value={`#${object.material.color.map(c => c.toString(16).padStart(2, '0')).join('')}`}
              onChange={(e) => {
                const color = e.target.value.slice(1);
                const rgb = [
                  parseInt(color.slice(0, 2), 16),
                  parseInt(color.slice(2, 4), 16),
                  parseInt(color.slice(4, 6), 16)
                ];
                handlePropertyChange('material', {
                  ...object.material,
                  color: rgb
                });
              }}
              className="color-picker"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default PropertyPanel; 