import React from 'react';
import ReactDOM from 'react-dom/client';
import AuthApp from '../../components/AuthApp';
import './style.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthApp layout="sidepanel" />
  </React.StrictMode>,
);
