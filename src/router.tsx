import {
  createBrowserRouter,
  Navigate,
  Outlet,
} from "react-router-dom";

import { AnalyticsTracker } from "@/components/layout/analytics-tracker";
import UserLayout from "@/layouts/user-layout";
import AssetsPage from "@/pages/assets";
import AuthPage from "@/pages/auth";
import CanvasPage from "@/pages/canvas";
import CanvasProjectPage from "@/pages/canvas/project";
import ConfigPage from "@/pages/config";
import HomePage from "@/pages/home";
import ImagePage from "@/pages/image";
import NotFound from "@/pages/not-found";
import PromptsPage from "@/pages/prompts";
import VideoPage from "@/pages/video";
import { useAuthStore } from "@/stores/use-auth-store";
import { lazy, Suspense } from "react";

const IpAssetsPage = lazy(() => import("@/pages/ip-assets"));
const StoryboardListPage = lazy(() => import("@/pages/storyboard"));
const StoryboardDetailPage = lazy(() => import("@/pages/storyboard/detail"));
const DashboardPage = lazy(() => import("@/pages/dashboard"));

/** 强制登录守卫：未登录一律跳转 /login。 */
function RequireAuth() {
  const token = useAuthStore((state) => state.token);
  if (!token) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export const router = createBrowserRouter([
  {
    element: <RequireAuth />,
    children: [
      {
        element: (
          <UserLayout>
            <AnalyticsTracker />
            <Outlet />
          </UserLayout>
        ),
        children: [
          { path: "/", element: <HomePage /> },
          { path: "/image", element: <ImagePage /> },
          { path: "/video", element: <VideoPage /> },
          { path: "/assets", element: <AssetsPage /> },
          { path: "/prompts", element: <PromptsPage /> },
          { path: "/canvas", element: <CanvasPage /> },
          { path: "/canvas/:id", element: <CanvasProjectPage /> },
          { path: "/config", element: <ConfigPage /> },
          {
            path: "/ip-assets",
            element: (
              <Suspense fallback={<div className="flex h-full items-center justify-center p-8 text-sm text-stone-500">加载中...</div>}>
                <IpAssetsPage />
              </Suspense>
            ),
          },
          {
            path: "/storyboard",
            element: (
              <Suspense fallback={<div className="flex h-full items-center justify-center p-8 text-sm text-stone-500">加载中...</div>}>
                <StoryboardListPage />
              </Suspense>
            ),
          },
          {
            path: "/storyboard/:id",
            element: (
              <Suspense fallback={<div className="flex h-full items-center justify-center p-8 text-sm text-stone-500">加载中...</div>}>
                <StoryboardDetailPage />
              </Suspense>
            ),
          },
          {
            path: "/dashboard",
            element: (
              <Suspense fallback={<div className="flex h-full items-center justify-center p-8 text-sm text-stone-500">加载中...</div>}>
                <DashboardPage />
              </Suspense>
            ),
          },
        ],
      },
    ],
  },
  { path: "/login", element: <AuthPage /> },
  { path: "*", element: <NotFound /> },
]);
