// ============================================================
// 1. KONFIGURASI SUPABASE
// ============================================================
const SUPABASE_URL = "https://hebcyohhmdvxtbfbolwj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_ayWX3dxRxwFsTSHLkDFZ0w_t7dX67RC";

// ============================================================
// 2. ELEMEN DOM
// ============================================================
const periodeSelect = document.getElementById("periode");
const refreshBtn = document.getElementById("refresh-btn");
const totalScoreEl = document.getElementById("total-score");
const totalIndicatorEl = document.getElementById("total-indicator");
const avgAchievementEl = document.getElementById("average-achievement");
const performanceStatusEl = document.getElementById("performance-status");
const employeeNameEl = document.getElementById("employee-name");
const employeePositionEl = document.getElementById("employee-position");
const periodeLabelEl = document.getElementById("periode-label");
const kpiTableBody = document.getElementById("kpi-table-body");
const tableTotalEl = document.getElementById("table-total");
const yearEl = document.getElementById("year");

if (yearEl) {
  yearEl.textContent = new Date().getFullYear();
}

let currentEmployeeId = null;
let supabaseClient = null;

// ============================================================
// 3. FORMAT TANGGAL KE NAMA BULAN INDONESIA
// ============================================================
function formatPeriodeIndonesia(dateString) {
  if (!dateString) return "-";
  const bulanIndo = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];
  const parts = dateString.split("-");
  if (parts.length < 2) return dateString;
  const tahun = parts[0];
  const bulanIndex = parseInt(parts[1], 10) - 1;
  return `${bulanIndo[bulanIndex] || parts[1]} ${tahun}`;
}

// ============================================================
// 4. MUAT DATA PEGAWAI & DAFTAR PERIODE OTOMATIS
// ============================================================
async function initDashboard() {
  try {
    if (!window.supabase) {
      throw new Error("Library Supabase gagal dimuat dari CDN. Periksa koneksi internet Anda.");
    }

    if (!supabaseClient) {
      supabaseClient = window.supabase.createClient("https://hebcyohhmdvxtbfbolwj.supabase.co", "sb_publishable_ayWX3dxRxwFsTSHLkDFZ0w_t7dX67RC");
    }

    refreshBtn.disabled = true;
    refreshBtn.textContent = "Memuat...";

    // Ambil data pegawai pertama
    const { data: employees, error: empError } = await supabaseClient
      .from("employees")
      .select("*")
      .limit(1);

    if (empError) throw empError;

    if (!employees || employees.length === 0) {
      kpiTableBody.innerHTML = `<tr><td colspan="9" class="empty-state">Data pegawai tidak ditemukan di tabel employees.</td></tr>`;
      performanceStatusEl.textContent = "Kosong";
      return;
    }

    const pegawai = employees[0];
    currentEmployeeId = pegawai.id;
    employeeNameEl.textContent = pegawai.nama;
    employeePositionEl.textContent = pegawai.jabatan || "Staff";

    // Ambil semua tanggal periode unik milik pegawai tersebut
    const { data: periodeRows, error: perError } = await supabaseClient
      .from("kpi_entries")
      .select("periode")
      .eq("employee_id", currentEmployeeId)
      .order("periode", { ascending: true });

    if (perError) throw perError;

    const uniquePeriodes = [...new Set((periodeRows || []).map((item) => item.periode))];

    if (uniquePeriodes.length === 0) {
      periodeSelect.innerHTML = `<option value="">Belum ada periode</option>`;
      periodeLabelEl.textContent = "-";
      kpiTableBody.innerHTML = `<tr><td colspan="9" class="empty-state">Belum ada data KPI di database.</td></tr>`;
      performanceStatusEl.textContent = "Kosong";
      return;
    }

    periodeSelect.innerHTML = uniquePeriodes
      .map((tgl) => `<option value="${tgl}">${formatPeriodeIndonesia(tgl)}</option>`)
      .join("");

    const latestPeriode = uniquePeriodes[uniquePeriodes.length - 1];
    periodeSelect.value = latestPeriode;

    await loadKpiData(latestPeriode);
  } catch (err) {
    console.error("Gagal memuat dashboard:", err);
    kpiTableBody.innerHTML = `<tr><td colspan="9" class="empty-state">Gagal terhubung: ${err.message}</td></tr>`;
    performanceStatusEl.textContent = "Error";
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = "Muat Ulang Data";
  }
}

// ============================================================
// 5. MUAT & HITUNG DATA KPI BERDASARKAN BULAN YANG DIPILIH
// ============================================================
async function loadKpiData(selectedPeriode) {
  if (!selectedPeriode || !currentEmployeeId) return;

  refreshBtn.disabled = true;
  refreshBtn.textContent = "Memuat...";
  periodeLabelEl.textContent = formatPeriodeIndonesia(selectedPeriode);
  kpiTableBody.innerHTML = `<tr><td colspan="9" class="empty-state">Mengambil data KPI...</td></tr>`;

  try {
    const { data: entries, error } = await supabaseClient
      .from("kpi_entries")
      .select("*")
      .eq("employee_id", currentEmployeeId)
      .eq("periode", selectedPeriode)
      .order("no_urut", { ascending: true });

    if (error) throw error;

    if (!entries || entries.length === 0) {
      kpiTableBody.innerHTML = `<tr><td colspan="9" class="empty-state">Tidak ada data KPI pada periode ini.</td></tr>`;
      updateSummary(0, 0, 0);
      return;
    }

    let totalScore = 0;
    let totalAchievement = 0;

    kpiTableBody.innerHTML = entries
      .map((row) => {
        const score = Number(row.kpi_score || 0);
        const ach = Number(row.achievement || 0);
        const weight = Number(row.weight || 0);

        totalScore += score;
        totalAchievement += ach;

        return `
          <tr>
            <td class="number">${row.no_urut}</td>
            <td class="indicator">${row.indicator}</td>
            <td>${row.measurement || "-"}</td>
            <td class="number">${row.target}</td>
            <td class="number">${row.actual}</td>
            <td class="number">${(ach * 100).toFixed(0)}%</td>
            <td class="number">${(weight * 100).toFixed(0)}%</td>
            <td class="number score">${score.toFixed(2)}</td>
            <td class="note">${row.keterangan || "-"}</td>
          </tr>
        `;
      })
      .join("");

    const avgAch = (totalAchievement / entries.length) * 100;
    updateSummary(totalScore, entries.length, avgAch);
  } catch (err) {
    console.error("Error loadKpiData:", err);
    kpiTableBody.innerHTML = `<tr><td colspan="9" class="empty-state">Terjadi kesalahan: ${err.message}</td></tr>`;
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = "Muat Ulang Data";
  }
}

// ============================================================
// 6. PERBARUI KARTU RINGKASAN & STATUS KINERJA
// ============================================================
function updateSummary(totalScore, count, avgAch) {
  totalScoreEl.textContent = totalScore.toFixed(2);
  totalIndicatorEl.textContent = count;
  avgAchievementEl.textContent = `${avgAch.toFixed(0)}%`;
  tableTotalEl.innerHTML = `Total KPIM Score: <strong>${totalScore.toFixed(2)}</strong>`;

  performanceStatusEl.className = "";
  if (count === 0) {
    performanceStatusEl.textContent = "-";
  } else if (totalScore >= 0.9) {
    performanceStatusEl.textContent = "Sangat Baik";
    performanceStatusEl.classList.add("status-success");
  } else if (totalScore >= 0.75) {
    performanceStatusEl.textContent = "Baik";
    performanceStatusEl.classList.add("status-warning");
  } else {
    performanceStatusEl.textContent = "Perlu Evaluasi";
    performanceStatusEl.classList.add("status-danger");
  }
}

// ============================================================
// 7. EVENT LISTENER
// ============================================================
periodeSelect.addEventListener("change", (e) => {
  loadKpiData(e.target.value);
});

refreshBtn.addEventListener("click", () => {
  initDashboard();
});

document.addEventListener("DOMContentLoaded", initDashboard);