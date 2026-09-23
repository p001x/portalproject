import {
  Leaf,
  Thermometer,
  Mountain,
  Wind,
  Trash2,
  AlertTriangle,
  Database,
  Flame,
  Edit,
  Activity,
  Globe2,
  Navigation,
  Droplet,
  Waves,
  UploadCloud,
  GraduationCap,
  BookOpen,
  Briefcase
} from "lucide-react";

export const agriWaterModules = [
  { path: "/ndvi", label: "NDVI", icon: Leaf, description: "Vegetation Health" },
  { path: "/drought", label: "Drought", icon: Droplet, description: "Agri Drought" },
  { path: "/irrigation", label: "Irrigation", icon: Droplet, description: "Scheduling Advisor" },
  { path: "/water-harvesting", label: "Water Harvesting", icon: Droplet, description: "Rainwater Calculator" },
  { path: "/wellscope", label: "WellScope", icon: Droplet, description: "Borehole Siting", status: "NEW" },
];

export const riskDisasterModules = [
  { path: "/flood", label: "Flood", icon: Waves, description: "Flood Risk" },
  { path: "/landslide", label: "Landslide", icon: AlertTriangle, description: "Susceptibility" },
  { path: "/rusle", label: "RUSLE", icon: Mountain, description: "Soil Erosion" },
  { path: "/air", label: "Air Pollution", icon: Wind, description: "NO2 Monitoring", status: "BETA" },
];

export const urbanEnvModules = [
  { path: "/uhi", label: "UHI", icon: Flame, description: "Urban Heat Island" },
  { path: "/landfill", label: "Landfill", icon: Trash2, description: "Site Suitability" },
  { path: "/biomass", label: "Biomass Tracker", icon: Flame, description: "Depletion Risk", status: "PRO" },
  { path: "/habitat", label: "Crane Habitat", icon: Leaf, description: "Suitability (AHP)" },
];

export const coreSpatialModules = [
  { path: "/change-detection", label: "Change Detection", icon: Activity, description: "NDVI Timelapse" },
  { path: "/lst", label: "LST", icon: Thermometer, description: "Land Surface Temp" },
  { path: "/slope", label: "Slope", icon: Mountain, description: "Topography" },
  { path: "/earthwork", label: "Earthwork", icon: Mountain, description: "Cut & Fill Estimator", status: "PRO" },
  { path: "/accessibility", label: "Accessibility", icon: Navigation, description: "Facility Access" },
];

export const analysisModules = [
  ...agriWaterModules,
  ...riskDisasterModules,
  ...urbanEnvModules,
  ...coreSpatialModules
];

export const rareDataModules = [
  { path: "/rare-data", label: "RARE DATA Hub", icon: Database, description: "Dataset Repository" },
  { path: "/harvester", label: "Data Harvester", icon: Globe2, description: "Universal Spatial Ingestion" },
];

export const digitizationModules = [
  { path: "/samples", label: "Sample Digitizer", icon: Edit, description: "Training Samples" },
];

export const infrastructureModules = [
  { path: "/cloud-ingest", label: "Cloud Ingestion", icon: UploadCloud, description: "Direct GEE Upload" },
  { path: "/services", label: "Premium Services", icon: Briefcase, description: "Consultation & Teaching" },
];

export const educationModules = [
  { path: "/academy", label: "Training & Academy", icon: GraduationCap, description: "Courses & Reading" },
  { path: "/blog", label: "Blog & Case Studies", icon: BookOpen, description: "News & Success Stories" },
];
