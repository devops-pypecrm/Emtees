import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Home, AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center space-y-4">
        <AlertCircle className="w-16 h-16 text-gray-300 mx-auto" />
        <h1 className="text-4xl font-bold text-gray-800">404</h1>
        <p className="text-gray-500">Page not found</p>
        <Link to="/">
          <Button className="bg-emerald-600 hover:bg-emerald-700">
            <Home className="w-4 h-4 mr-2" /> Go Home
          </Button>
        </Link>
      </div>
    </div>
  );
}
