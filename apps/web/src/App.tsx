import { Navigate, Route, Routes } from "react-router";
import { RequireHousehold } from "@/auth/RequireHousehold";
import { AppLayout } from "@/components/AppLayout";
import { AuthCallbackPage } from "@/routes/AuthCallbackPage";
import { HomePage } from "@/routes/HomePage";
import { LoginPage } from "@/routes/LoginPage";
import {
  DishDetailPage,
  FavoritesPage,
  LeftoversPage,
  PlanCreatePage,
  ProposalPage,
  ShoppingPage,
} from "@/routes/placeholders";
import { SettingsPage } from "@/routes/SettingsPage";

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
        <Route path="plan/new" element={<PlanCreatePage />} />
        <Route path="plan/new/leftovers" element={<LeftoversPage />} />
        <Route path="plans/:planId/proposal" element={<ProposalPage />} />
        <Route path="dishes/:recipeId" element={<DishDetailPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
