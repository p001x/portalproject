const fs = require('fs');

let content = fs.readFileSync('main.py', 'utf8');

// BiomassRequest
content = content.replace(
    /year_start:\s*Optional\[int\]\s*=\s*2019\r?\n\s*year_end:\s*Optional\[int\]\s*=\s*2023/,
    'start_year: int = Field(2019, ge=1980, le=2024)\n    end_year: int = Field(2023, ge=1980, le=2024)'
);

// RUSLERequest
content = content.replace(
    /year:\s*int\s*=\s*Field\(2023,\s*ge=2010,\s*le=2024\)/,
    'start_year: int = Field(2019, ge=1980, le=2024)\n    end_year: int = Field(2023, ge=1980, le=2024)'
);

// DroughtRequest
content = content.replace(
    /year:\s*int\s*=\s*Field\(2023,\s*ge=2013,\s*le=2024\)/,
    'start_year: int = Field(2019, ge=1980, le=2024)\n    end_year: int = Field(2023, ge=1980, le=2024)'
);

// HabitatRequest
content = content.replace(
    /year:\s*int\s*=\s*Field\(2021,\s*description="Year for analysis"\)/,
    'start_year: int = Field(2019, ge=1980, le=2024)\n    end_year: int = Field(2023, ge=1980, le=2024)'
);

// WaterHarvestingRequest
content = content.replace(
    /class WaterHarvestingRequest\(BaseModel\):\r?\n\s*aoi: dict\r?\n\s*year: int/,
    'class WaterHarvestingRequest(BaseModel):\n    aoi: dict\n    start_year: int = Field(2019, ge=1980, le=2024)\n    end_year: int = Field(2023, ge=1980, le=2024)'
);

// Function signatures
// Biomass
content = content.replace(/req\.year_start,\s*req\.year_end/g, 'req.start_year, req.end_year');

// RUSLE map
content = content.replace(/req\.year,\s*req\.reverse_r/g, 'req.start_year, req.end_year, req.reverse_r');
// RUSLE classify
content = content.replace(/req\.year,\s*req\.n_classes/g, 'req.start_year, req.end_year, req.n_classes');

// Drought map
content = content.replace(/req\.year,\s*req\.n_classes/g, 'req.start_year, req.end_year, req.n_classes');
// Drought stats/export
content = content.replace(/req\.year,\s*req\.reverse_sm/g, 'req.start_year, req.end_year, req.reverse_sm');

// Habitat map
content = content.replace(/req\.year,\s*req\.n_classes/g, 'req.start_year, req.end_year, req.n_classes');
// Habitat stats
content = content.replace(/req\.year,\s*req\.reverse_flags/g, 'req.start_year, req.end_year, req.reverse_flags');

// WaterHarvesting
content = content.replace(/req\.year\)/g, 'req.start_year, req.end_year)');
content = content.replace(/req\.year,\s*req\.runoff/g, 'req.start_year, req.end_year, req.runoff');

fs.writeFileSync('main.py', content, 'utf8');
console.log("Done");
