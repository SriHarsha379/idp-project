import ProtectedRoute from "../../components/ProtectedRoute";
import UserDashboard from "../auth/user-dashboard";

export default function UserDashWrapper() {
  return (
    <ProtectedRoute role="USER">
      <UserDashboard />
    </ProtectedRoute>
  );
}
