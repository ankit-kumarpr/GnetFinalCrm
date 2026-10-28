import { createContext, useContext, useEffect, useState } from "react";
import api from "../services/api";

const BrandContext = createContext({
  brand: { companyName: "", logoUrl: "" },
  refreshBrand: async () => {},
});

export function BrandProvider({ children }) {
  const [brand, setBrand] = useState({ companyName: "", logoUrl: "" });

  const refreshBrand = async () => {
    const res = await api.get("/settings/brand");
    setBrand({
      companyName: res.data.data?.companyName || "",
      logoUrl: res.data.data?.logoUrl || "",
    });
  };

  useEffect(() => {
    refreshBrand().catch(() => {});
  }, []);

  return (
    <BrandContext.Provider value={{ brand, refreshBrand }}>
      {children}
    </BrandContext.Provider>
  );
}

export const useBrand = () => useContext(BrandContext);
