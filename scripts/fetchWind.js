const axios = require('axios');
const fs = require('fs');
const grib2jsonModule = require('grib2json');

const grib2json = grib2jsonModule.default || grib2jsonModule;

const OUTPUT_FILE = './data/wind.json';
const TEMP_GRIB = 'wind.grib2';
const TEMP_JSON = 'wind_raw.json';

function yyyymmdd(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function getNoaaCandidateUrls() {
  const now = new Date();
  const cycleHours = [18, 12, 6, 0];
  const candidates = [];

  for (let dayOffset = 0; dayOffset < 2; dayOffset++) {
    const baseDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dayOffset));
    const datePart = yyyymmdd(baseDate);

    for (const cycle of cycleHours) {
      const cyclePart = String(cycle).padStart(2, '0');
      const dir = encodeURIComponent(`/gfs.${datePart}/${cyclePart}/atmos`);
      const file = `gfs.t${cyclePart}z.pgrb2.0p25.f000`;
      const url = `https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl?file=${file}&lev_10_m_above_ground=on&var_UGRD=on&var_VGRD=on&subregion=&leftlon=110&rightlon=155&toplat=-10&bottomlat=-45&dir=${dir}`;
      candidates.push(url);
    }
  }

  return candidates;
}

async function fetchGrib() {
  const candidates = getNoaaCandidateUrls();
  let lastError = null;

  for (const url of candidates) {
    try {
      const res = await axios({
        url,
        method: 'GET',
        responseType: 'arraybuffer',
        timeout: 45000,
        headers: {
          'User-Agent': 'WhereIsTheDeer-WindFetcher/1.0',
          'Accept': '*/*'
        }
      });

      if (!res.data || !res.data.byteLength) {
        throw new Error('NOAA returned empty payload.');
      }

      fs.writeFileSync(TEMP_GRIB, res.data);
      console.log(`Downloaded GRIB from: ${url}`);
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Failed to download NOAA GRIB from all candidate URLs.');
}

function convertToJson() {
  return new Promise((resolve, reject) => {
    grib2json(TEMP_GRIB, { data: true }, (err, json) => {
      if (err) {
        reject(new Error(`grib2json conversion failed. Ensure the grib2json binary is installed and available in PATH (or set GRIB2JSON_PATH). Details: ${err.message}`));
        return;
      }
      fs.writeFileSync(TEMP_JSON, JSON.stringify(json));
      resolve();
    });
  });
}

function processData() {
  const raw = JSON.parse(fs.readFileSync(TEMP_JSON, 'utf8'));

  const uData = raw.find((r) => r.header.parameterCategory === 2 && r.header.parameterNumber === 2);
  const vData = raw.find((r) => r.header.parameterCategory === 2 && r.header.parameterNumber === 3);

  if (!uData || !vData) {
    throw new Error('UGRD/VGRD 10m fields not found in converted GRIB JSON.');
  }

  const width = uData.header.nx;
  const height = uData.header.ny;

  const result = {
    width,
    height,
    u: uData.data,
    v: vData.data
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result));
}

function cleanupTempFiles() {
  [TEMP_GRIB, TEMP_JSON].forEach((path) => {
    if (fs.existsSync(path)) {
      fs.unlinkSync(path);
    }
  });
}

(async () => {
  try {
    console.log('Fetching NOAA wind...');
    await fetchGrib();

    console.log('Converting GRIB...');
    await convertToJson();

    console.log('Processing...');
    processData();

    cleanupTempFiles();
    console.log('Done: wind.json updated');
  } catch (error) {
    console.error('Wind fetch failed:', error.message);
    process.exitCode = 1;
  }
})();
