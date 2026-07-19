import React from "react";
import ReactDOM from "react-dom/client";
import { Navigate, RouterProvider, createBrowserRouter } from "react-router-dom";
import { AppLayout } from "./ui/AppLayout";
import { DashboardPage } from "./pages/DashboardPage";
import { NewFilePage } from "./pages/NewFilePage";
import { ValidatePage } from "./pages/ValidatePage";
import { TaxPage } from "./pages/TaxPage";
import { SubmitPage } from "./pages/SubmitPage";
import { FileDetailPage } from "./pages/FileDetailPage";
import "./styles.css";

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: "dashboard", element: <DashboardPage /> },
      { path: "ai-builder", element: <DashboardPage /> },
      { path: "recorder", element: <DashboardPage /> },
      { path: "workflows", element: <DashboardPage /> },
      { path: "jobs", element: <DashboardPage /> },
      { path: "approvals", element: <DashboardPage /> },
      { path: "documents", element: <DashboardPage /> },
      { path: "opportunities", element: <DashboardPage /> },
      { path: "connectors", element: <DashboardPage /> },
      { path: "compliance", element: <DashboardPage /> },
      { path: "file/new", element: <NewFilePage /> },
      { path: "file/:id/validate", element: <ValidatePage /> },
      { path: "file/:id/tax", element: <TaxPage /> },
      { path: "file/:id/submit", element: <SubmitPage /> },
      { path: "file/:id", element: <FileDetailPage /> }
    ]
  }
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
