import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { IngredientList } from './pages/IngredientList';
import { Login } from './pages/Login';
import { RecipeForm } from './pages/RecipeForm';
import { RecipeList } from './pages/RecipeList';
import { RecipeViewer } from './pages/RecipeViewer';
import { Register } from './pages/Register';
import { RegisterThanks } from './pages/RegisterThanks';

export function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/register/thanks" element={<RegisterThanks />} />
      <Route path="/recipes/share/:shareId" element={<RecipeViewer />} />

      {/* Protected routes */}
      <Route path="/recipes" element={
        <ProtectedRoute>
          <Layout><RecipeList /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/recipes/recipe/:id" element={
        <ProtectedRoute>
          <Layout><RecipeViewer /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/recipes/add" element={
        <ProtectedRoute>
          <Layout><RecipeForm /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/recipes/edit/:id" element={
        <ProtectedRoute>
          <Layout><RecipeForm /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/ingredients" element={
        <ProtectedRoute>
          <Layout><IngredientList /></Layout>
        </ProtectedRoute>
      } />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/recipes" replace />} />
    </Routes>
  );
}
