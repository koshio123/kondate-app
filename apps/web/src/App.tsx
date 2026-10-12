import { Navigate, Route, Routes } from "react-router";
import { RequireHousehold } from "@/auth/RequireHousehold";
import { AppLayout } from "@/components/AppLayout";
import { AuthCallbackPage } from "@/routes/AuthCallbackPage";
import { DishDetailPage } from "@/routes/DishDetailPage";
import { FavoritesPage } from "@/routes/FavoritesPage";
import { HomePage } from "@/routes/HomePage";
import { LeftoversPage } from "@/routes/LeftoversPage";
import { LoginPage } from "@/routes/LoginPage";
import { PlanEditPage } from "@/routes/PlanEditPage";
import { ProposalPage } from "@/routes/ProposalPage";
import { SettingsPage } from "@/routes/SettingsPage";
import { ShoppingPage } from "@/routes/ShoppingPage";

/** Routes follow the screen list in docs/02_design.md "2.1 画面一覧". */
export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />

      <Route element={<RequireHousehold />}>
        <Route element={<AppLayout />}>
          <Route index element={<HomePage />} />
          <Route path="shopping" element={<ShoppingPage />} />
          <Route path="favorites" element={<FavoritesPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="plan/new" element={<PlanEditPage />} />
        <Route path="plans/:planId/edit" element={<PlanEditPage />} />
        <Route path="plans/:planId/leftovers" element={<LeftoversPage />} />
        <Route path="plans/:planId/proposal" element={<ProposalPage />} />
        <Route path="dishes/:recipeId" element={<DishDetailPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
