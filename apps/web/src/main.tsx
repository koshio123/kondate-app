import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { onlineManager, QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import { AppErrorBoundary, CACHE_KEY } from "./components/AppErrorBoundary";
import { AuthProvider } from "./auth/AuthProvider";
import { registerShoppingMutations } from "./lib/shoppingList";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: true,
      // Keep data long enough to be restored from storage when the shop has no signal.
      gcTime: 1000 * 60 * 60 * 24 * 7,
    },
  },
});
registerShoppingMutations(queryClient);

// TanStack Query assumes "online" at start and only listens for changes, so an app opened
// without signal would send checks straight away and lose them. Start from the real state.
onlineManager.setOnline(navigator.onLine);

// The last data (and checks made offline) survive closing the app, so the shopping list
// opens in the shop even without a connection.
const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: CACHE_KEY,
});

// Bump when the shape of cached data changes (e.g. a new field on Plan), so data saved by
// an older version is dropped instead of crashing the screens. Checks not yet sent are
// dropped with it, so do this only when needed.
// v2 (2026-10-18): make-ahead fields (PlanDish.madeOn / alsoOn).
const CACHE_VERSION = "v2";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

createRoot(root).render(
  <StrictMode>
    <AppErrorBoundary>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister, maxAge: 1000 * 60 * 60 * 24 * 7, buster: CACHE_VERSION }}
        onSuccess={() => void queryClient.resumePausedMutations()}
      >
        <AuthProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AuthProvider>
      </PersistQueryClientProvider>
    </AppErrorBoundary>
  </StrictMode>,
);
