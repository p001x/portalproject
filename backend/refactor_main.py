import re

with open("main.py", "r") as f:
    content = f.read()

# BiomassRequest
content = re.sub(
    r"year_start:\s*Optional\[int\]\s*=\s*2019\n\s*year_end:\s*Optional\[int\]\s*=\s*2023",
    r"start_year: int = Field(2019, ge=1980, le=2024)\n    end_year: int = Field(2023, ge=1980, le=2024)",
    content
)
# RUSLERequest
content = re.sub(
    r"year:\s*int\s*=\s*Field\(2023,\s*ge=2010,\s*le=2024\)",
    r"start_year: int = Field(2019, ge=1980, le=2024)\n    end_year: int = Field(2023, ge=1980, le=2024)",
    content
)
# DroughtRequest
content = re.sub(
    r"year:\s*int\s*=\s*Field\(2023,\s*ge=2013,\s*le=2024\)",
    r"start_year: int = Field(2019, ge=1980, le=2024)\n    end_year: int = Field(2023, ge=1980, le=2024)",
    content
)
# HabitatRequest
content = re.sub(
    r"year:\s*int\s*=\s*Field\(2021,\s*description=\"Year for analysis\"\)",
    r"start_year: int = Field(2019, ge=1980, le=2024)\n    end_year: int = Field(2023, ge=1980, le=2024)",
    content
)
# WaterHarvestingRequest
content = re.sub(
    r"year:\s*int",
    r"start_year: int = Field(2019, ge=1980, le=2024)\n    end_year: int = Field(2023, ge=1980, le=2024)",
    content
)

# Function signatures for Biomass
content = re.sub(r"req\.year_start,\s*req\.year_end", r"req.start_year, req.end_year", content)

# Function signatures for WaterHarvesting
content = re.sub(r"req\.year,", r"req.start_year, req.end_year,", content)

# Function signatures for RUSLE
content = re.sub(r"req\.year,", r"req.start_year, req.end_year,", content)

# Function signatures for Drought
content = re.sub(r"req\.year,", r"req.start_year, req.end_year,", content)

# Function signatures for Habitat
content = re.sub(r"req\.year,", r"req.start_year, req.end_year,", content)

with open("main.py", "w") as f:
    f.write(content)
