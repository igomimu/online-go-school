import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './course.css';
import CoursePage from './CoursePage';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CoursePage />
  </StrictMode>,
);
