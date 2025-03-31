import React from 'react';
import DesignStudio from './components/DesignStudio';
import ChatInterface from './components/ChatInterface';
import PropertyPanel from './components/PropertyPanel';

function App() {
  return (
    <div className="flex h-screen bg-gray-100">
      <div className="flex-1">
        <DesignStudio />
      </div>
      <div className="w-1/3 flex flex-col">
        <div className="flex-1">
          <ChatInterface />
        </div>
        <div className="h-1/2">
          <PropertyPanel />
        </div>
      </div>
    </div>
  );
}

export default App; 