import { Request, Response } from "express";
import supabase from "../config/db";
import { v4 as uuidv4 } from "uuid";

export interface LocationPoint {
  name: "string";
  latitude: "number";
  longitude: "number";
}

export interface Step1Body {
  org_id: string;
  loading_location: LocationPoint;
  unloading_location: LocationPoint;
  stops?: LocationPoint[];
  departure_date: string; // ISO date (YYYY-MM-DD) or full ISO timestamp
  trip_amount: number;
}
export interface Step2Body {
  org_id: string;
  temp_trip_id: string;
  material_type: string; // You may want to restrict to your material_type_enum values
  material_weight: { value: number; unit: string }; // unit -> 'ton' | 'kg' etc.
  truck_type: string; // e.g., 'leased' | 'owned' OR map to trip_type_enum?
  selected_truck_id?: string; // may be null until user selects
  driver_1_id?: string;
  driver_2_id?: string; // optional co-driver
}

export interface Step3Body {
  org_id: string;
  temp_trip_id: string;
  trip_type: string;
  customer: { name: string; phone_number: string };
  loader?: { name: string; phone_number: string };
  unloader?: { name: string; phone_number: string };
}

const ALLOWED_MATERIAL_TYPES = [
  "constructional_material",
  "agricultural_products",
  "industrial_goods",
  "mining_bulk_materials",
  "consumer_goods",
  "logistics_packaging",
  "automotive_fuel",
  "refrigerated_perishable_items",
  "liquids_tanker_loads",
  "waste_recyclables",
  "others",
  "specialized_hazardous_goods",
  "infrastructure_utility_equipment",
] as const;

export type MaterialType = (typeof ALLOWED_MATERIAL_TYPES)[number];
const DEFAULT_TRIP_TYPE_ENUM_VALUE = "regular" as unknown as string;
function parseDepartureDate(d: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return `${d}T00:00:00.000Z`;
  }
  return d;
}

function isValidLatLng(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

export const basicTripInfo = async (req: Request, res: Response) => {
  console.log("basicTripInfo");
  try {
    const {
      org_id,
      loading_location,
      unloading_location,
      stops,
      departure_date,
      trip_amount,
    } = req.body;
    if (
      !unloading_location ||
      !isValidLatLng(unloading_location.latitude) ||
      !isValidLatLng(unloading_location.longitude)
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing unloading location coordinates",
      });
    }
    if (
      !loading_location ||
      !isValidLatLng(loading_location.latitude) ||
      !isValidLatLng(loading_location.longitude)
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing loading location coordinates",
      });
    }
    if (!org_id) {
      return res.status(400).json({ error: "org_id is required" });
    }

    if (stops) {
      for (const stop of stops) {
        if (!isValidLatLng(stop.latitude) || !isValidLatLng(stop.longitude)) {
        }
      }
    }
    const route_distance = 254.0; // km
    const route_duration = 270; // minutes

    const temp_trip_id = uuidv4();
    const departure_date_iso = parseDepartureDate(departure_date);
    const { data, error } = await supabase.from("temp_trips").insert([
      {
        temp_trip_id: temp_trip_id,
        org_id,
        loading_location: loading_location,
        unloading_location: unloading_location,
        stops: stops,
        departure_date: departure_date_iso,
        trip_amount,
      },
    ]);
    if (error) {
      console.log("error", error);
      return res
        .status(500)
        .json({ success: false, message: "DB insert failed" });
    }
    console.log("data", data);
    return res.status(200).json({
      success: true,
      message: "Trip created successfully",
      route_distance,
      route_duration,
      temp_trip_id,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

// Helper function to convert any unit to tons
function convertToTons(value: number, unit: string): number {
  switch (unit.toLowerCase()) {
    case "kg":
      return value / 1000;
    case "lb":
      return value * 0.000453592;
    case "ton":
    default:
      return value;
  }
}

export const recommendTrucks = async (
  req: Request<{}, any, Step2Body>,
  res: Response
) => {
  console.log("recommendTrucks");
  try {
    const {
      org_id,
      temp_trip_id,
      material_type,
      material_weight,
      truck_type,
      selected_truck_id,
      driver_1_id,
      driver_2_id,
    } = req.body;

    // --- Validations ---
    if (!org_id) return res.status(400).json({ error: "org_id is required" });
    if (!temp_trip_id)
      return res.status(400).json({ error: "temp_trip_id is required" });

    if (
      !ALLOWED_MATERIAL_TYPES.includes(material_type as MaterialType) ||
      !material_weight ||
      typeof material_weight.value !== "number" ||
      !material_weight.unit ||
      (material_weight.unit !== "ton" &&
        material_weight.unit !== "kg" &&
        material_weight.unit !== "lb")
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid material unit or missing weight or material type",
      });
    }

    // --- Fetch trucks ---
    const { data: trucks, error } = await supabase
      .from("trucks")
      .select("truck_id, truck_number, maximum_load, weight_unit")
      .eq("organisation_id", org_id)
      .eq("truck_type", truck_type);

    if (error) throw error;

    const materialWeightTons = convertToTons(
      material_weight.value,
      material_weight.unit
    );

    // --- Filter trucks by capacity ---
    const filteredTrucks =
      (trucks ?? []).filter((t) => {
        const truckCapacityTons = convertToTons(t.maximum_load, t.weight_unit);
        return truckCapacityTons >= materialWeightTons;
      }) || [];

    // --- Map recommended trucks ---
    const recommended_trucks = filteredTrucks.map((t) => {
      const truckCapacityTons = convertToTons(t.maximum_load, t.weight_unit);
      return {
        truck_id: t.truck_id,
        truck_number: t.truck_number,
        capacity: truckCapacityTons,
        proximity_km: Number((Math.random() * 10).toFixed(1)), // Placeholder proximity
      };
    });

    // --- Validate selected truck ---
    if (selected_truck_id) {
      const found = filteredTrucks.some(
        (t) => t.truck_id === selected_truck_id
      );
      if (!found) {
        return res
          .status(404)
          .json({ success: false, message: "Truck not available" });
      }
    }

    // --- Update temp_trips ---
    const { error: updateError } = await supabase
      .from("temp_trips")
      .update({
        material_type,
        material_weight,
        truck_type,
        selected_truck_id: selected_truck_id ?? null,
        driver_1_id: driver_1_id ?? null,
        driver_2_id: driver_2_id ?? null,
      })
      .eq("temp_trip_id", temp_trip_id);

    if (updateError) {
      console.error("updateError", updateError);
      return res
        .status(500)
        .json({ success: false, message: "DB update failed" });
    }

    return res.status(200).json({
      success: true,
      message: "Trucks recommended successfully",
      recommended_trucks,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};
export const addCustomerDetails = async (
  req: Request<{}, any, Step3Body>,
  res: Response
) => {
  console.log("addCustomerDetails");
  try {
    const { org_id, temp_trip_id, customer, loader, unloader, trip_type } =
      req.body || {};
    console.log("req.body", req.body);
    if (!org_id) return res.status(400).json({ error: "org_id is required" });
    if (!temp_trip_id)
      return res.status(400).json({ error: "temp_trip_id is required" });
    if (!customer?.name || !customer?.phone_number) {
      return res
        .status(400)
        .json({ error: "Missing customer name or phone number" });
    }
    if (!trip_type || !["Leased", "Owned"].includes(trip_type)) {
      return res.status(400).json({ error: "trip_type is required" });
    }

    // Fetch temp trip
    const { data: tempTrip, error: fetchError } = await supabase
      .from("temp_trips")
      .select("*")
      .eq("temp_trip_id", temp_trip_id)
      .single();

    if (fetchError || !tempTrip) {
      console.error("fetch temp_trip error", fetchError);
      return res
        .status(404)
        .json({ success: false, message: "Temp trip not found" });
    }

    if (!tempTrip.driver_1_id)
      return res
        .status(400)
        .json({ message: "Driver assignment missing (step2 incomplete)" });

    if (!tempTrip.selected_truck_id)
      return res
        .status(400)
        .json({ message: "Truck not selected (step2 incomplete)" });

    if (!tempTrip.material_weight?.value)
      return res
        .status(400)
        .json({ message: "Material weight missing in step2" });

    // Find customer
    const { data: customerData, error: customerError } = await supabase
      .from("users")
      .select("user_id")
      .eq("phone_number", customer.phone_number)
      .single();

    if (customerError || !customerData) {
      return res
        .status(404)
        .json({ success: false, message: "Customer not found" });
    }

    const trip_id = uuidv4();
    const { error: tripInsertError } = await supabase.from("trips").insert([
      {
        id: trip_id,
        departure_date: tempTrip.departure_date,
        amount: tempTrip.trip_amount,
        currency_code: "INR",
        material_type: tempTrip.material_type,
        truck_tonnage: tempTrip.material_weight.value,
        weight_unit: tempTrip.material_weight.unit,
        trip_type: trip_type,
        truck_id: tempTrip.selected_truck_id,
        driver_id: tempTrip.driver_1_id,
        customer_id: customerData.user_id,
      },
    ]);

    if (tripInsertError) {
      console.error("tripInsertError", tripInsertError);
      return res
        .status(500)
        .json({ success: false, message: "Trip insert failed" });
    }

    return res
      .status(200)
      .json({ success: true, message: "Trip created successfully", trip_id });
  } catch (error) {
    console.error("addCustomerDetails error", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error", error });
  }
};
