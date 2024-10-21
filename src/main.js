const express = require("express");
const mysql = require("mysql2");
const bodyParser = require("body-parser");
const semver = require("semver");
const CreateRelease = require("./models/CreateRelease.js");
const ListReleases = require("./models/ListReleases.js");
const { authenticateAPIKey } = require("./middleware/authentication.js");
require("dotenv").config();

const app = express();
const port = 3000;

// Middleware to parse JSON bodies
app.use(bodyParser.json());

// MySQL database connection
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// Connect to the database
db.connect((err) => {
  if (err) {
    console.error("Error connecting to the database:", err);
    return;
  }
  console.log("Connected to the MySQL database.");
});

// Route to create a new release
const createReleaseRoute = (db) => (req, res) => {
  let createRelease;

  try {
    createRelease = new CreateRelease(req.body);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const query =
    "INSERT INTO releases (name, version, account, region) VALUES (?, ?, ?, ?)";
  db.query(
    query,
    [
      createRelease.name,
      createRelease.version,
      createRelease.account,
      createRelease.region,
    ],
    (err, result) => {
      if (err) {
        console.error("Error inserting release:", err);
        return res.status(500).json({ error: "Failed to create release." });
      }
      res.status(201).json({
        message: "Release created successfully.",
        releaseId: result.insertId,
      });
    }
  );
};

// Route to get all releases with pagination
const listReleasesRoute = (db) => (req, res) => {
  let listReleases;

  try {
    listReleases = new ListReleases(req.query);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const query =
    "SELECT * FROM releases ORDER BY created_at DESC LIMIT ? OFFSET ?";
  db.query(query, [listReleases.limit, listReleases.offset], (err, results) => {
    if (err) {
      console.error("Error fetching releases:", err);
      return res.status(500).json({ error: "Failed to fetch releases." });
    }
    res.status(200).json(results);
  });
};

const detectDriftRoute = (db) => async (req, res) => {
  const driftReports = [];
  const appNames = [
    "application_one",
    "application_two",
    "application_three",
    "application_four",
    "application_five",
    "application_six",
    "application_seven",
    "application_eight",
    "application_nine",
    "application_ten",
  ];
  let remainingQueries = appNames.length;

  appNames.forEach((app) => {
    const versionMap = {};
    const environmentMap = {};

    // Create a map to track which versions are deployed in which environments
    db.query("SELECT * FROM releases WHERE name = ?", [app], (err, results) => {
      if (err) {
        console.error("Failed to fetch releases:", err);
        remainingQueries -= 1;
        if (remainingQueries === 0 && driftReports.length === 0) {
          res.status(404).json({ error: "No drift detected" });
        }
        return;
      }

      // Populate versionMap with the deployments across environments
      results.forEach((release) => {
        const versionKey = {
          account: release.account,
          region: release.region,
        };
        if (!versionMap[release.version]) {
          versionMap[release.version] = [];
        }
        versionMap[release.version].push(versionKey);

        // Populate environmentMap with the current deployed version for each environment
        const envKey = `${release.account}_${release.region}`;
        environmentMap[envKey] = release.version;
      });

      // Define the expected environments dynamically
      const accounts = [
        "staging",
        "prod_one",
        "prod_two",
        "prod_three",
        "prod_four",
        "prod_five",
      ];
      const regions = ["primary", "secondary"];
      const expectedEnvironments = [];

      accounts.forEach((account) => {
        regions.forEach((region) => {
          expectedEnvironments.push({ account, region });
        });
      });

      // Determine the latest version using semantic versioning
      let currentLatestVersion = null;
      Object.keys(versionMap).forEach((version) => {
        if (!currentLatestVersion || semver.gt(version, currentLatestVersion)) {
          currentLatestVersion = version;
        }
      });

      // Check if any environment is missing the latest version
      const latestVersionEnvironments = versionMap[currentLatestVersion] || [];
      const driftDetails = {};

      expectedEnvironments.forEach((expectedEnv) => {
        const deployedEnv = latestVersionEnvironments.find(
          (env) =>
            env.account === expectedEnv.account &&
            env.region === expectedEnv.region
        );

        if (!deployedEnv) {
          if (!driftDetails[expectedEnv.account]) {
            driftDetails[expectedEnv.account] = {};
          }
          const envKey = `${expectedEnv.account}_${expectedEnv.region}`;
          const currentVersion = environmentMap[envKey] || "none";
          driftDetails[expectedEnv.account][expectedEnv.region] =
            currentVersion;
        }
      });

      // Add drift information if there are any missing environments
      if (Object.keys(driftDetails).length > 0) {
        driftReports.push({
          [app]: {
            latest: currentLatestVersion,
            drift: driftDetails,
          },
        });
      }

      // Respond once all queries have completed
      remainingQueries -= 1;
      if (remainingQueries === 0) {
        if (driftReports.length > 0) {
          res.status(200).json(driftReports);
        } else {
          res
            .status(404)
            .json({ error: "No drift detected", db_host: process.env.DB_HOST });
        }
      }
    });
  });
};

// Inject dependencies into routes
app.post("/release", authenticateAPIKey, createReleaseRoute(db));
app.get("/releases", listReleasesRoute(db));
app.get("/drift", detectDriftRoute(db));

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
