import { Navigate, Outlet } from 'react-router-dom';
import React, { useContext } from "react";
import { AuthContext } from "../context/AuthProvider";
const ProtectedRoute = ({ requireAdmin = false }) => {
  const { user, isAdmin } = useContext(AuthContext);
  // If no user is found, redirect to login page
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // If admin is required but user is not admin, redirect to home page
  if (requireAdmin && !isAdmin()) {
    return <Navigate to="/" replace />;
  }

  // If all conditions are met, render the child routes
  return <Outlet />;
};

export default ProtectedRoute;