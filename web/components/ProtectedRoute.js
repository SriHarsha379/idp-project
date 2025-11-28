import { useRouter } from "next/router";
import { useEffect } from "react";

export default function ProtectedRoute({ children, role }) {
  const router = useRouter();

  useEffect(() => {
    const email = sessionStorage.getItem("userEmail");
    const userRole = sessionStorage.getItem("userType");

    if (!email) {
      router.replace("/auth/login");
      return;
    }

    if (role && userRole?.toUpperCase() !== role.toUpperCase()) {
      router.replace("/auth/login");
    }
  }, []);

  return children;
}
