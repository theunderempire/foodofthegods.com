import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { BASE_URL } from "./api/client";
import { ROUTES } from "./routes";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { IngredientList } from "./pages/IngredientList";
import { Login } from "./pages/Login";
import { NotFound } from "./pages/NotFound";
import { RecipeForm } from "./pages/RecipeForm";
import { RecipeList } from "./pages/RecipeList";
import { RecipeViewer } from "./pages/RecipeViewer";
import { Register } from "./pages/Register";
import { Settings } from "./pages/Settings";
import { RegisterThanks } from "./pages/RegisterThanks";
import { SetPassword } from "./pages/SetPassword";

export function App() {
  useEffect(() => {
    async function checkHealth() {
      try {
        const res = await fetch(`${BASE_URL}/health`);
        if (!res.ok) throw new Error();
      } catch {
        window.dispatchEvent(new CustomEvent("api-error", { detail: "API is unreachable" }));
      }
    }
    checkHealth();
    const id = setInterval(checkHealth, 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <span data-version={__GIT_HASH__} className="sr-only" />
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/register/thanks" element={<RegisterThanks />} />
        <Route path="/set-password" element={<SetPassword />} />
        <Route path={ROUTES.recipes.SHARE_PATTERN} element={<RecipeViewer />} />

        {/* Protected routes */}
        <Route
          path="/recipes"
          element={
            <ProtectedRoute>
              <Layout>
                <RecipeList />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.recipes.VIEW_PATTERN}
          element={
            <ProtectedRoute>
              <Layout>
                <RecipeViewer />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.recipes.new}
          element={
            <ProtectedRoute>
              <Layout>
                <RecipeForm />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.recipes.EDIT_PATTERN}
          element={
            <ProtectedRoute>
              <Layout>
                <RecipeForm />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/ingredients"
          element={
            <ProtectedRoute>
              <Layout>
                <IngredientList />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Layout>
                <Settings />
              </Layout>
            </ProtectedRoute>
          }
        />

        {/* Fallback */}
        <Route path="/" element={<Navigate to="/recipes" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}
