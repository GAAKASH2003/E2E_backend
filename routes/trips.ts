import { Router } from "express";
import {
  basicTripInfo,
  recommendTrucks,
  addCustomerDetails,
} from "../controllers/tripController";
const router = Router();

// temp_trips table

// create table public.temp_trips (
//     temp_trip_id uuid not null default gen_random_uuid (),
//     org_id uuid not null,
//     loading_location jsonb not null,
//     unloading_location jsonb not null,
//     stops jsonb null,
//     departure_date date not null,
//     trip_amount numeric(12, 2) not null,
//     route_distance numeric(10, 2) null,
//     route_duration integer null,
//     material_type text null,
//     material_weight jsonb null,
//     truck_type text null,
//     selected_truck_id uuid null,
//     driver_1_id uuid null,
//     driver_2_id uuid null,
//     customer jsonb null,
//     loader jsonb null,
//     unloader jsonb null,
//     created_at timestamp with time zone not null default now(),
//     updated_at timestamp with time zone not null default now(),
//     constraint temp_trips_pkey primary key (temp_trip_id),
//     constraint temp_trips_driver_1_id_fkey foreign KEY (driver_1_id) references users (user_id) on delete CASCADE,
//     constraint temp_trips_driver_2_id_fkey foreign KEY (driver_2_id) references users (user_id) on delete CASCADE,
//     constraint temp_trips_org_id_fkey foreign KEY (org_id) references organisations (organisation_id) on delete CASCADE
//   ) TABLESPACE pg_default;

//   create index IF not exists idx_temp_trips_org_id on public.temp_trips using btree (org_id) TABLESPACE pg_default;

//   create index IF not exists idx_temp_trips_departure_date on public.temp_trips using btree (departure_date) TABLESPACE pg_default;

router.post("/step1", basicTripInfo);
router.get("/step2", recommendTrucks);
router.post("/step3", addCustomerDetails);
export default router;
