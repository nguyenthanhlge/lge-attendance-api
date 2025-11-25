const express = require("express");
const { google } = require("googleapis");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// Đọc GOOGLE_CREDENTIALS từ biến môi trường Render
const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);

// Tạo Google Auth từ biến môi trường
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

// ID Google Sheet
const spreadsheetId = "1HRPzyWjgxLh_JLyM0EHs7scenOwMhzGOFlZnYf_CnpM";

// Hàm lấy sheets client
async function getSheets() {
  const client = await auth.getClient();
  return google.sheets({ version: "v4", auth: client });
}

/**
 * ===============================================
 * 1) LẤY ĐIỂM DANH THEO NGÀY
 * GET /attendance/day?className=6A1&dayLabel=22/11
 * ===============================================
 */
app.get("/attendance/day", async (req, res) => {
  const { className, dayLabel } = req.query;

  if (!className || !dayLabel) {
    return res.status(400).json({ error: "Thiếu className hoặc dayLabel" });
  }

  try {
    const sheets = await getSheets();

    const headerResp = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${className}!H3:S3`,
    });

    const headerRow = headerResp.data.values?.[0] || [];
    const colIndex = headerRow.findIndex(
      (v) => String(v).trim() === String(dayLabel).trim()
    );

    if (colIndex === -1) {
      return res.status(404).json({ error: `Không tìm thấy ngày '${dayLabel}' trong H3:S3` });
    }

    const targetColLetter = String.fromCharCode("H".charCodeAt(0) + colIndex);

    const namesResp = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${className}!B5:B50`,
    });

    const attendResp = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${className}!${targetColLetter}5:${targetColLetter}50`,
    });

    const names = namesResp.data.values || [];
    const attendance = attendResp.data.values || [];

    const result = names.map((row, idx) => ({
      row: 5 + idx,
      name: row[0] || "",
      status: attendance[idx]?.[0] || "",
    }));

    res.json({
      className,
      dayLabel,
      column: targetColLetter,
      data: result,
    });
  } catch (err) {
    console.error("ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * ===============================================
 * 2) CẬP NHẬT ĐIỂM DANH
 * PUT /attendance/day
 * ===============================================
 */
app.put("/attendance/day", async (req, res) => {
  const { className, dayLabel, items } = req.body;

  if (!className || !dayLabel || !Array.isArray(items)) {
    return res.status(400).json({ error: "Thiếu className, dayLabel hoặc items" });
  }

  try {
    const sheets = await getSheets();

    const headerResp = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${className}!H3:S3`,
    });

    const headerRow = headerResp.data.values?.[0] || [];
    const colIndex = headerRow.findIndex(
      (v) => String(v).trim() === String(dayLabel).trim()
    );

    if (colIndex === -1) {
      return res.status(404).json({ error: `Không tìm thấy ngày '${dayLabel}'` });
    }

    const targetColLetter = String.fromCharCode("H".charCodeAt(0) + colIndex);

    const namesResp = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${className}!B5:B50`,
    });

    const names = namesResp.data.values || [];
    const nameToRow = new Map();

    names.forEach((r, idx) => {
      const name = r[0]?.trim();
      if (name) nameToRow.set(name, 5 + idx);
    });

    const updateData = [];

    items.forEach((item) => {
      const row = nameToRow.get(item.name.trim());
      if (row) {
        updateData.push({
          range: `${className}!${targetColLetter}${row}`,
          values: [[item.status]],
        });
      }
    });

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data: updateData,
      },
    });

    res.json({ success: true, updatedCells: updateData.length });
  } catch (err) {
    console.error("ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * ===============================================
 * 3) TỔNG HỢP
 * ===============================================
 */
app.get("/attendance/summary", async (req, res) => {
  try {
    const className = req.query.className;
    if (!className) return res.status(400).json({ error: "Missing className" });

    const sheets = await getSheets();
    const range = `${className}!A51:Y51`;

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const row = response.data.values?.[0] || [];

    const summary = {
      className,
      totalStudents: row[0] ?? 0,
      presentCount: row[19] ?? 0,
      paidLessons: row[21] ?? 0,
      revenue: row[24] ?? 0,
      dept: row[25] ?? 0,
      attendanceRate: row[23] ?? "0%",
    };

    res.json(summary);
  } catch (err) {
    console.error("SUMMARY ERROR:", err);
    res.status(500).json({ error: "Failed to fetch summary" });
  }
});

// Start server
app.listen(3000, () => {
  console.log("LGE Attendance API is running on port 3000");
});
