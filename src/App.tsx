import React from 'react';
import AudioEditor from './components/AudioEditor';
import './App.css';

function App() {
  return (
    <div className="app" data-testid="app-container">
      <AudioEditor />
    </div>
  );
}

export default App;
