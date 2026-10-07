import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, push, set, update, remove, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// Cấu hình Firebase Realtime Database Thiện Tâm
const firebaseConfig = {
  apiKey: "AIzaSyDMG2vTkRu9MJowEjkAc1pYouEpiLG_J_Y",
  authDomain: "dbthientam.firebaseapp.com",
  databaseURL: "https://dbthientam-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "dbthientam",
  storageBucket: "dbthientam.firebasestorage.app",
  messagingSenderId: "798399783388",
  appId: "1:798399783388:web:f56c939bdd1fe97d18af19",
  measurementId: "G-WQGEQP5DP2"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const MAX_PATIENTS_PER_SLOT = 3; // Giới hạn tối đa 3 người / khung giờ

// Trạng thái toàn cục
window.appointments = [];
window.currentCallingPatient = null;
let qrScanner = null;
let qrCodeInstance = null;

// Cấu hình khung giờ khám theo ngày
const TIME_SLOTS = {
  weekday: [
    { slot: "11:30 - 12:00", label: "Buổi Trưa" },
    { slot: "12:00 - 12:30", label: "Buổi Trưa" },
    { slot: "12:30 - 13:00", label: "Buổi Trưa" },
    { slot: "13:00 - 13:30", label: "Buổi Trưa" },
    { slot: "17:00 - 17:30", label: "Buổi Chiều" },
    { slot: "17:30 - 18:00", label: "Buổi Chiều" },
    { slot: "18:00 - 18:30", label: "Chiều Muộn" },
    { slot: "18:30 - 19:00", label: "Chiều Muộn" }
  ],
  weekend: [
    { slot: "07:00 - 07:30", label: "Sáng Sớm" },
    { slot: "07:30 - 08:00", label: "Buổi Sáng" },
    { slot: "08:00 - 08:30", label: "Buổi Sáng" },
    { slot: "08:30 - 09:00", label: "Buổi Sáng" },
    { slot: "09:00 - 09:30", label: "Buổi Sáng" },
    { slot: "09:30 - 10:00", label: "Buổi Sáng" },
    { slot: "10:00 - 10:30", label: "Buổi Sáng" },
    { slot: "10:30 - 11:00", label: "Buổi Sáng" },
    { slot: "11:00 - 11:30", label: "Buổi Trưa" },
    { slot: "11:30 - 12:00", label: "Buổi Trưa" },
    { slot: "12:00 - 12:30", label: "Buổi Trưa" },
    { slot: "12:30 - 13:00", label: "Buổi Trưa" },
    { slot: "15:00 - 15:30", label: "Buổi Chiều" },
    { slot: "15:30 - 16:00", label: "Buổi Chiều" },
    { slot: "16:00 - 16:30", label: "Buổi Chiều" },
    { slot: "16:30 - 17:00", label: "Buổi Chiều" }
  ]
};

// Render khung giờ khám theo ngày và khóa khi đủ 3 người
window.renderTimeSlotsByDate = function() {
  const dateInput = document.getElementById("appointmentDate");
  const container = document.getElementById("slotPickerContainer");
  const badge = document.getElementById("dayTypeBadge");
  if (!dateInput || !container) return;

  const selectedDateStr = dateInput.value;
  if (!selectedDateStr) return;

  const d = new Date(selectedDateStr + "T00:00:00");
  const dayOfWeek = d.getDay();
  const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);

  const slots = isWeekend ? TIME_SLOTS.weekend : TIME_SLOTS.weekday;

  if (badge) {
    if (isWeekend) {
      badge.textContent = dayOfWeek === 0 ? "Chủ Nhật" : "Thứ 7";
      badge.className = "text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200";
    } else {
      const days = ["CN", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
      badge.textContent = `${days[dayOfWeek]} (Giờ Ngày Thường)`;
      badge.className = "text-[11px] font-bold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200";
    }
  }

  const dayBookings = window.appointments.filter(a => a.date === selectedDateStr && a.status !== 'ABSENT');
  let hasSelectedFirstAvailable = false;

  container.innerHTML = slots.map((item) => {
    const bookedCount = dayBookings.filter(a => a.timeSlot === item.slot).length;
    const isFull = bookedCount >= MAX_PATIENTS_PER_SLOT;
    const remaining = Math.max(0, MAX_PATIENTS_PER_SLOT - bookedCount);

    let checkAttr = "";
    if (!isFull && !hasSelectedFirstAvailable) {
      checkAttr = "checked";
      hasSelectedFirstAvailable = true;
    }

    if (isFull) {
      return `
        <div class="border border-slate-200 bg-slate-100 rounded-xl p-2 text-center opacity-60 cursor-not-allowed select-none">
          <div class="text-[11px] font-bold font-mono text-slate-400 line-through">${item.slot}</div>
          <div class="text-[9px] text-rose-500 font-semibold mt-0.5">Đã đầy (3/3)</div>
        </div>
      `;
    }

    return `
      <label class="cursor-pointer border border-slate-200 rounded-xl p-2.5 text-center hover:border-teal-500 transition-all has-[:checked]:border-teal-600 has-[:checked]:bg-teal-50 has-[:checked]:text-teal-700 block">
        <input type="radio" name="appointmentSlot" value="${item.slot}" ${checkAttr} class="hidden">
        <div class="text-xs font-bold font-mono">${item.slot}</div>
        <div class="text-[9px] text-emerald-600 font-medium mt-0.5">Còn ${remaining} chỗ</div>
      </label>
    `;
  }).join("");
};

// Hàm chuẩn hóa viết hoa chữ cái đầu
function formatProperCase(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/(^|\s)\S/g, l => l.toUpperCase());
}

// Bảng ánh xạ 4 chuyên khoa/dịch vụ -> Phòng khám
function getRoomForDepartment(dept) {
  switch (dept) {
    case 'Vật lý trị liệu': return 'Phòng Vật Lý Trị Liệu';
    case 'Xét nghiệm': return 'Phòng Xét Nghiệm';
    case 'Siêu âm': return 'Phòng Siêu Âm';
    case 'Khám bệnh':
    default: return 'Phòng 102 - Khám Bệnh';
  }
}

window.handleDepartmentChange = function() {
  const dept = document.getElementById('department').value;
  const room = getRoomForDepartment(dept);
  const roomDisplay = document.getElementById('ticketRoomDisplay');
  if (roomDisplay) roomDisplay.textContent = room;
};

// ĐỒNG BỘ TUỔI VÀ NĂM SINH
function setupAgeDobSync() {
  const ageInput = document.getElementById("patientAge");
  const dobInput = document.getElementById("patientDob");
  const currentYear = new Date().getFullYear();

  if (ageInput && dobInput) {
    ageInput.addEventListener("input", () => {
      const ageVal = parseInt(ageInput.value, 10);
      if (!isNaN(ageVal) && ageVal >= 0 && ageVal <= 130) {
        const birthYear = currentYear - ageVal;
        dobInput.value = `${birthYear}-01-01`;
      }
    });

    dobInput.addEventListener("change", () => {
      if (dobInput.value) {
        const birthYear = new Date(dobInput.value).getFullYear();
        if (!isNaN(birthYear)) {
          const calculatedAge = currentYear - birthYear;
          if (calculatedAge >= 0 && calculatedAge <= 130) {
            ageInput.value = calculatedAge;
          }
        }
      }
    });
  }

  // Đồng bộ trong modal sửa
  const editAgeInput = document.getElementById("editAge");
  const editDobInput = document.getElementById("editDob");
  if (editAgeInput && editDobInput) {
    editAgeInput.addEventListener("input", () => {
      const ageVal = parseInt(editAgeInput.value, 10);
      if (!isNaN(ageVal) && ageVal >= 0 && ageVal <= 130) {
        editDobInput.value = `${currentYear - ageVal}-01-01`;
      }
    });

    editDobInput.addEventListener("change", () => {
      if (editDobInput.value) {
        const birthYear = new Date(editDobInput.value).getFullYear();
        if (!isNaN(birthYear)) {
          editAgeInput.value = currentYear - birthYear;
        }
      }
    });
  }
}

// 1. LẮNG NGHE DỮ LIỆU REALTIME TỪ FIREBASE
const appointmentsRef = ref(db, 'appointments');
onValue(appointmentsRef, (snapshot) => {
  const data = snapshot.val();
  const list = [];
  if (data) {
    Object.keys(data).forEach(key => {
      list.push({ ...data[key], _key: key });
    });
  }
  window.appointments = list;
  
  const calling = list.find(a => a.status === 'CALLING');
  window.currentCallingPatient = calling || null;

  window.renderDashboardTable();
  window.renderTimeSlotsByDate();
  updateStats();
  updateTVScreen();
}, (error) => {
  console.warn("Lỗi Firebase:", error);
  showToast("Không thể tải từ Firebase: " + error.message, "error");
});

const callingRef = ref(db, 'currentCalling');
onValue(callingRef, (snapshot) => {
  const callData = snapshot.val();
  if (callData) {
    window.currentCallingPatient = callData;
  }
  updateStats();
  updateTVScreen();
});

// 2. GỬI ĐĂNG KÝ VÀ LƯU VÀO FIREBASE
window.handleRegistrationSubmit = async function(event) {
  event.preventDefault();
  const form = document.getElementById('appointmentForm');
  const submitBtn = document.getElementById('submitRegisterBtn');

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const apptDate = document.getElementById('appointmentDate').value;

  if (apptDate < todayStr) {
    showToast("Ngày đặt lịch không hợp lệ! Vui lòng chọn từ ngày hôm nay trở đi.", "error");
    return;
  }

  const slotInput = document.querySelector('input[name="appointmentSlot"]:checked');
  if (!slotInput) {
    showToast("Tất cả khung giờ trong ngày này đã đầy, vui lòng chọn ngày khác!", "error");
    return;
  }
  const slot = slotInput.value;

  // Kiểm tra sức chứa tối đa 3 người
  const currentSlotBookings = window.appointments.filter(a => a.date === apptDate && a.timeSlot === slot && a.status !== 'ABSENT');
  if (currentSlotBookings.length >= MAX_PATIENTS_PER_SLOT) {
    showToast(`Khung giờ ${slot} vừa có người đặt và đã đủ 3 người. Vui lòng chọn khung giờ khác!`, "error");
    window.renderTimeSlotsByDate();
    return;
  }

  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>Đang lưu lên Firebase...';

  const rawName = document.getElementById('patientName').value.trim();
  const name = formatProperCase(rawName);
  const phone = document.getElementById('patientPhone').value.trim() || 'Không cung cấp';
  const idCard = document.getElementById('patientIdCard').value.trim() || 'Chưa cập nhật';
  const gender = document.getElementById('patientGender').value;
  const dob = document.getElementById('patientDob').value;
  const currentYear = new Date().getFullYear();
  const calculatedAge = dob ? (currentYear - new Date(dob).getFullYear()) : (document.getElementById('patientAge').value || 'Chưa rõ');
  const department = document.getElementById('department').value;
  const room = getRoomForDepartment(department);
  const symptoms = document.getElementById('symptoms').value.trim();

  const sameDayAppointments = window.appointments.filter(a => a.date === apptDate);
  const nextStt = sameDayAppointments.length + 1;
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const appointmentId = `MED-2026-${randomSuffix}`;

  const newRecord = {
    id: appointmentId,
    stt: nextStt,
    fullName: name,
    phone: phone,
    age: calculatedAge,
    idCard: idCard,
    gender: gender,
    dob: dob,
    department: department,
    room: room,
    date: apptDate,
    timeSlot: slot,
    symptoms: symptoms,
    status: 'PENDING',
    createdAt: new Date().toISOString()
  };

  try {
    const newPostRef = push(ref(db, 'appointments'));
    await set(newPostRef, newRecord);

    renderTicketCard(newRecord);

    form.reset();
    initDateInputs();

    try {
      confetti({ particleCount: 75, spread: 60, origin: { y: 0.6 } });
    } catch (e) {}

    showToast(`Đăng ký thành công! Số thứ tự tạm thời là #${nextStt}`, 'success');
  } catch (err) {
    console.error(err);
    showToast("Lỗi đẩy dữ liệu: " + err.message, "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fa-solid fa-qrcode text-lg mr-2"></i><span>Xác Nhận & Lưu Lên Hệ Thống Realtime</span>';
  }
};

window.resetAndCreateNewBooking = function() {
  const form = document.getElementById('appointmentForm');
  if (form) form.reset();
  
  initDateInputs();

  document.getElementById('ticketResult').classList.add('hidden');
  document.getElementById('emptyTicketState').classList.remove('hidden');
  document.getElementById('patientName').focus();

  showToast('Đã xóa dữ liệu cũ, sẵn sàng nhập bệnh nhân mới!', 'info');
};

function renderTicketCard(record) {
  document.getElementById('emptyTicketState').classList.add('hidden');
  document.getElementById('ticketResult').classList.remove('hidden');

  document.getElementById('ticketNumberDisplay').textContent = '#' + (record.stt < 10 ? '0' + record.stt : record.stt);
  document.getElementById('ticketRoomDisplay').textContent = record.room;
  document.getElementById('ticketCodeDisplay').textContent = record.id;
  document.getElementById('ticketNameDisplay').textContent = record.fullName;
  document.getElementById('ticketAgeDobDisplay').textContent = `${record.age || '--'} tuổi (Sinh: ${record.dob || 'N/A'})`;
  document.getElementById('ticketPhoneDisplay').textContent = record.phone;
  document.getElementById('ticketTimeDisplay').textContent = `${record.date} (${record.timeSlot})`;
  document.getElementById('ticketDeptDisplay').textContent = record.department;
  document.getElementById('ticketStatusDisplay').textContent = 'Chưa Check-in (Vui lòng quét QR tại quầy)';

  const qrContainer = document.getElementById('qrcode');
  qrContainer.innerHTML = '';
  
  try {
    qrCodeInstance = new QRCode(qrContainer, {
      text: record.id,
      width: 145,
      height: 145,
      colorDark: '#0f766e',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
  } catch (err) {
    console.warn("Lỗi render QR:", err);
  }
}

window.downloadQrCode = function() {
  const qrImg = document.querySelector('#qrcode img');
  if (qrImg && qrImg.src) {
    const link = document.createElement('a');
    link.href = qrImg.src;
    link.download = `QR-PhieuKham-${document.getElementById('ticketCodeDisplay').textContent}.png`;
    link.click();
    showToast('Đã tải ảnh mã QR xuống thiết bị', 'info');
  } else {
    showToast('Chưa có mã QR để tải', 'error');
  }
};

// 3. TIẾNG CHUÔNG VÀ PHÁT LOA
function playHospitalChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    
    const o1 = ctx.createOscillator();
    const g1 = ctx.createGain();
    o1.frequency.setValueAtTime(659.25, ctx.currentTime);
    g1.gain.setValueAtTime(0.12, ctx.currentTime);
    g1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    o1.connect(g1);
    g1.connect(ctx.destination);
    o1.start(ctx.currentTime);
    o1.stop(ctx.currentTime + 0.4);

    const o2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    o2.frequency.setValueAtTime(523.25, ctx.currentTime + 0.2);
    g2.gain.setValueAtTime(0.12, ctx.currentTime + 0.2);
    g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.65);
    o2.connect(g2);
    g2.connect(ctx.destination);
    o2.start(ctx.currentTime + 0.2);
    o2.stop(ctx.currentTime + 0.65);
  } catch (e) {}
}

window.announcePatientVoice = function(patient) {
  if (!('speechSynthesis' in window)) return;

  try {
    window.speechSynthesis.cancel();
  } catch (e) {}

  playHospitalChime();

  const name = patient && patient.fullName ? formatProperCase(patient.fullName) : '';
  const text = `Mời bệnh nhân ${name}, vào phòng khám.`;

  setTimeout(() => {
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'vi-VN';
      utterance.rate = 0.86;
      utterance.pitch = 1.05;

      const voices = window.speechSynthesis.getVoices();
      const naturalVoice = voices.find(v => 
        (v.lang === 'vi-VN' || v.lang === 'vi_VN' || v.lang.startsWith('vi')) &&
        (v.name.includes('Natural') || v.name.includes('Online') || v.name.includes('Google') || v.name.includes('HoaiMy'))
      ) || voices.find(v => v.lang === 'vi-VN' || v.lang.startsWith('vi'));

      if (naturalVoice) utterance.voice = naturalVoice;

      window.speechSynthesis.speak(utterance);
    } catch (err) {}
  }, 350);
};

window.testSpeechNotification = function() {
  const demo = window.currentCallingPatient || { fullName: 'Nguyễn Văn An' };
  window.announcePatientVoice(demo);
  showToast('Đang phát loa: "Mời bệnh nhân... vào phòng khám"', 'info');
};

// 4. THAO TÁC BÁC SĨ (GỌI, HOÀN TẤT, ĐỔI TRẠNG THÁI)
window.callSpecificPatient = async function(id) {
  const patient = window.appointments.find(a => a.id === id);
  if (!patient) return;

  try {
    const updates = {};
    window.appointments.forEach(a => {
      if (a.status === 'CALLING' && a._key && a.id !== id) {
        updates[`appointments/${a._key}/status`] = 'WAITING';
      }
    });

    if (patient._key) {
      updates[`appointments/${patient._key}/status`] = 'CALLING';
    }
    
    const callInfo = {
      id: patient.id,
      stt: patient.stt,
      fullName: patient.fullName,
      room: patient.room,
      timeSlot: patient.timeSlot,
      department: patient.department,
      calledAt: new Date().toISOString()
    };
    updates['currentCalling'] = callInfo;

    await update(ref(db), updates);

    window.currentCallingPatient = callInfo;
    window.announcePatientVoice(patient);
    showToast(`Đang gọi: ${patient.fullName} (#${patient.stt})`, 'info');
  } catch (e) {
    console.error(e);
    showToast("Lỗi gọi khám: " + e.message, "error");
  }
};

window.repeatCurrentCall = function() {
  if (window.currentCallingPatient) {
    window.announcePatientVoice(window.currentCallingPatient);
    showToast(`Đã phát lại gọi ${window.currentCallingPatient.fullName}`, 'info');
  }
};

window.completeCurrentCall = async function() {
  if (!window.currentCallingPatient) return;
  
  const targetId = window.currentCallingPatient.id;
  const finishedName = window.currentCallingPatient.fullName || "bệnh nhân";
  const found = window.appointments.find(a => a.id === targetId);
  
  try {
    const updates = {};
    if (found && found._key) {
      updates[`appointments/${found._key}/status`] = 'COMPLETED';
    }
    updates['currentCalling'] = null;
    window.currentCallingPatient = null;

    await update(ref(db), updates);

    showToast(`Đã hoàn tất khám cho bệnh nhân ${finishedName}`, 'success');
    updateStats();
    updateTVScreen();
  } catch (e) {
    showToast("Lỗi hoàn tất: " + e.message, "error");
  }
};

window.markStatus = async function(id, newStatus) {
  const patient = window.appointments.find(a => a.id === id);
  if (!patient || !patient._key) return;

  try {
    const updates = {};
    updates[`appointments/${patient._key}/status`] = newStatus;
    if (window.currentCallingPatient && window.currentCallingPatient.id === id && newStatus !== 'CALLING') {
      updates['currentCalling'] = null;
    }
    await update(ref(db), updates);
    showToast(`Đã cập nhật trạng thái phiếu ${patient.id}`, 'info');
  } catch (e) {
    showToast("Lỗi cập nhật: " + e.message, "error");
  }
};

// 5. CHỨC NĂNG SỬA & XÓA BỆNH NHÂN TRÊN FIREBASE
window.openEditModal = function(id) {
  const patient = window.appointments.find(a => a.id === id);
  if (!patient) return;

  const currentYear = new Date().getFullYear();
  const calculatedAge = patient.age || (patient.dob ? (currentYear - new Date(patient.dob).getFullYear()) : "");

  document.getElementById("editKey").value = patient._key;
  document.getElementById("editModalCode").textContent = `Mã: ${patient.id} • STT #${patient.stt}`;
  document.getElementById("editName").value = patient.fullName || "";
  document.getElementById("editPhone").value = patient.phone !== 'Không cung cấp' ? (patient.phone || "") : "";
  document.getElementById("editAge").value = calculatedAge;
  document.getElementById("editDob").value = patient.dob || "";
  document.getElementById("editIdCard").value = patient.idCard !== 'Chưa cập nhật' ? (patient.idCard || "") : "";
  document.getElementById("editGender").value = patient.gender || "Nam";
  document.getElementById("editDept").value = patient.department || "Khám bệnh";
  document.getElementById("editSlot").value = patient.timeSlot || "";
  document.getElementById("editDate").value = patient.date || "";
  document.getElementById("editStatus").value = patient.status || "PENDING";
  document.getElementById("editSymptoms").value = patient.symptoms || "";

  document.getElementById("editPatientModal").classList.remove("hidden");
};

window.closeEditModal = function() {
  document.getElementById("editPatientModal").classList.add("hidden");
};

window.handleEditSubmit = async function(event) {
  event.preventDefault();
  const key = document.getElementById("editKey").value;
  if (!key) return;

  // Lấy hồ sơ hiện tại trước khi chỉnh sửa
  const currentRecord = window.appointments.find(a => a._key === key);
  if (!currentRecord) return;

  const saveBtn = document.getElementById("saveEditBtn");
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>Đang lưu...';

  const updatedDept = document.getElementById("editDept").value;
  const dobVal = document.getElementById("editDob").value;
  const currentYear = new Date().getFullYear();
  const ageVal = dobVal ? (currentYear - new Date(dobVal).getFullYear()) : (document.getElementById("editAge").value || "Chưa rõ");
  const newDate = document.getElementById("editDate").value;

  // TÍNH LẠI STT NẾU ĐỔI NGÀY KHÁM:
  let finalStt = currentRecord.stt;
  if (currentRecord.date !== newDate) {
    // Đếm số lượng bệnh nhân đã có của ngày mới (loại trừ chính bản ghi này nếu có)
    const newDayAppointments = window.appointments.filter(a => a.date === newDate && a._key !== key && a.status !== 'ABSENT');
    finalStt = newDayAppointments.length + 1; // Tự động nhảy số thứ tự của ngày mới
  }

  const updatedData = {
    stt: finalStt, // Cập nhật số thứ tự mới
    fullName: formatProperCase(document.getElementById("editName").value.trim()),
    phone: document.getElementById("editPhone").value.trim() || "Không cung cấp",
    age: ageVal,
    idCard: document.getElementById("editIdCard").value.trim() || "Chưa cập nhật",
    gender: document.getElementById("editGender").value,
    dob: dobVal,
    department: updatedDept,
    room: getRoomForDepartment(updatedDept),
    timeSlot: document.getElementById("editSlot").value.trim(),
    date: newDate,
    status: document.getElementById("editStatus").value,
    symptoms: document.getElementById("editSymptoms").value.trim()
  };

  try {
    await update(ref(db, `appointments/${key}`), updatedData);
    
    // Nếu bệnh nhân đang gọi bị sửa thông tin thì đồng bộ luôn sang lượt gọi
    if (window.currentCallingPatient && window.currentCallingPatient._key === key) {
      await update(ref(db, 'currentCalling'), {
        stt: updatedData.stt,
        fullName: updatedData.fullName,
        room: updatedData.room,
        timeSlot: updatedData.timeSlot,
        department: updatedData.department
      });
    }

    showToast(`Cập nhật thành công! Số thứ tự cho ngày ${newDate} là #${finalStt}`, "success");
    window.closeEditModal();
  } catch (err) {
    showToast("Lỗi khi lưu sửa đổi: " + err.message, "error");
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk mr-1"></i><span>Lưu Thay Đổi</span>';
  }
};

window.deletePatient = async function(id) {
  const patient = window.appointments.find(a => a.id === id);
  if (!patient || !patient._key) return;

  const isConfirmed = confirm(`Bạn có chắc chắn muốn XÓA bệnh nhân: "${patient.fullName}" (Mã: ${patient.id}) không?\nThao tác này không thể hoàn tác!`);
  if (!isConfirmed) return;

  try {
    await remove(ref(db, `appointments/${patient._key}`));

    if (window.currentCallingPatient && window.currentCallingPatient.id === id) {
      await set(ref(db, 'currentCalling'), null);
      window.currentCallingPatient = null;
    }

    showToast(`Đã xóa bệnh nhân ${patient.fullName} khỏi hệ thống`, "success");
  } catch (err) {
    showToast("Lỗi khi xóa bệnh nhân: " + err.message, "error");
  }
};

// 6. HIỂN THỊ DANH SÁCH BỆNH NHÂN TRÊN DASHBOARD
window.renderDashboardTable = function() {
  const search = (document.getElementById('searchInput').value || '').toLowerCase().trim();
  const status = document.getElementById('statusFilter').value;
  const dateVal = document.getElementById('dateFilter').value;
  const tbody = document.getElementById('patientTableBody');

  let filtered = (window.appointments || []).filter(item => {
    const matchSearch = (item.fullName || '').toLowerCase().includes(search) || 
                        (item.id || '').toLowerCase().includes(search) || 
                        (item.phone || '').includes(search);
    const matchStatus = (status === 'ALL') || (item.status === status);
    const matchDate = (!dateVal) || (item.date === dateVal);
    return matchSearch && matchStatus && matchDate;
  });

  filtered.sort((a, b) => a.stt - b.stt);
  tbody.innerHTML = '';

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-10 text-slate-400">
          <i class="fa-regular fa-folder-open text-3xl mb-2 block"></i>
          Không tìm thấy bệnh nhân nào phù hợp bộ lọc.
        </td>
      </tr>
    `;
    document.getElementById('tableRecordSummary').textContent = 'Hiển thị 0 bệnh nhân';
    return;
  }

  filtered.forEach(p => {
    const tr = document.createElement('tr');
    tr.className = `hover:bg-slate-50 transition-colors ${p.status === 'CALLING' ? 'bg-teal-50/70 font-medium' : ''}`;

    let statusBadge = '';
    if (p.status === 'PENDING') {
      statusBadge = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600"><span class="w-1.5 h-1.5 rounded-full bg-slate-400 mr-1.5"></span>Chưa check-in</span>';
    } else if (p.status === 'WAITING') {
      statusBadge = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800"><span class="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5"></span>Chờ khám</span>';
    } else if (p.status === 'CALLING') {
      statusBadge = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800 animate-pulse"><span class="w-1.5 h-1.5 rounded-full bg-teal-600 mr-1.5"></span>Đang khám</span>';
    } else if (p.status === 'COMPLETED') {
      statusBadge = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800"><i class="fa-solid fa-check text-[9px] mr-1"></i>Hoàn tất</span>';
    } else if (p.status === 'ABSENT') {
      statusBadge = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">Vắng mặt</span>';
    }

    let actionButtons = '';
    if (p.status === 'PENDING') {
      actionButtons = `
        <button onclick="processCheckIn('${p.id}')" title="Check-in cho bệnh nhân" class="px-2.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-semibold shadow-sm transition">
          <i class="fa-solid fa-qrcode mr-1"></i>Check-in
        </button>
      `;
    } else {
      actionButtons = `
        <button onclick="callSpecificPatient('${p.id}')" title="Gọi loa phát thanh" class="p-2 rounded-lg bg-teal-50 hover:bg-teal-600 hover:text-white text-teal-700 transition-all font-semibold">
          <i class="fa-solid fa-bullhorn"></i>
        </button>
        <button onclick="markStatus('${p.id}', 'COMPLETED')" title="Đánh dấu đã khám xong" class="p-2 rounded-lg bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-700 transition-all">
          <i class="fa-solid fa-check"></i>
        </button>
      `;
    }

    tr.innerHTML = `
      <td class="py-3 px-4 text-center font-mono font-bold text-slate-800 text-sm">
        #${p.stt < 10 ? '0' + p.stt : p.stt}
      </td>
      <td class="py-3 px-4">
        <div class="font-bold text-slate-900">${p.fullName}</div>
        <div class="text-[11px] text-slate-500">${p.age ? p.age + ' tuổi' : ''} • ${p.gender || 'N/A'} • SĐT: ${p.phone}</div>
      </td>
      <td class="py-3 px-4 font-mono">
        <span class="text-teal-700 font-semibold">${p.id}</span>
        <div class="text-[11px] text-slate-500 font-sans">${p.date} • ${p.timeSlot}</div>
      </td>
      <td class="py-3 px-4 max-w-xs">
        <div class="text-slate-700 font-medium">${p.department}</div>
        <div class="text-[11px] text-slate-400 truncate" title="${p.symptoms || ''}">${p.symptoms || 'Không có'}</div>
      </td>
      <td class="py-3 px-4 text-center">
        ${statusBadge}
      </td>
      <td class="py-3 px-4 text-center">
        <div class="inline-flex items-center space-x-1.5">
          ${actionButtons}
          <button onclick="openPatientDetails('${p.id}')" title="Xem chi tiết phiếu" class="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all">
            <i class="fa-regular fa-eye"></i>
          </button>
          <button onclick="openEditModal('${p.id}')" title="Sửa thông tin bệnh nhân" class="p-2 rounded-lg bg-amber-50 hover:bg-amber-600 hover:text-white text-amber-600 transition-all">
            <i class="fa-solid fa-pen-to-square"></i>
          </button>
          <button onclick="deletePatient('${p.id}')" title="Xóa bệnh nhân" class="p-2 rounded-lg bg-rose-50 hover:bg-rose-600 hover:text-white text-rose-600 transition-all">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </td>
    `;

    tbody.appendChild(tr);
  });

  document.getElementById('tableRecordSummary').textContent = `Hiển thị ${filtered.length} trên tổng ${window.appointments.length} hồ sơ Realtime`;
};

// 7. CẬP NHẬT THỐNG KÊ VÀ TV DISPLAY
function updateStats() {
  const today = new Date().toISOString().split('T')[0];
  const todayAppts = (window.appointments || []).filter(a => a.date === today);

  const total = todayAppts.length;
  const waiting = todayAppts.filter(a => a.status === 'WAITING').length;
  const calling = todayAppts.filter(a => a.status === 'CALLING').length;
  const done = todayAppts.filter(a => a.status === 'COMPLETED').length;

  document.getElementById('statTotalCount').textContent = total;
  document.getElementById('statWaitingCount').textContent = waiting;
  document.getElementById('statCallingCount').textContent = calling;
  document.getElementById('statDoneCount').textContent = done;
  document.getElementById('badgeWaiting').textContent = waiting;

  const activeCallName = document.getElementById('activeCallName');
  const activeCallNumber = document.getElementById('activeCallNumber');
  const activeCallDetails = document.getElementById('activeCallDetails');
  const btnRepeat = document.getElementById('btnRepeatCall');
  const btnFinish = document.getElementById('btnFinishCurrent');

  if (window.currentCallingPatient && window.currentCallingPatient.fullName) {
    activeCallName.textContent = window.currentCallingPatient.fullName;
    activeCallNumber.textContent = `#${window.currentCallingPatient.stt < 10 ? '0' + window.currentCallingPatient.stt : window.currentCallingPatient.stt}`;
    activeCallDetails.textContent = `${window.currentCallingPatient.room || ''} • ${window.currentCallingPatient.timeSlot || ''} • Mã: ${window.currentCallingPatient.id || ''}`;
    btnRepeat.disabled = false;
    btnFinish.disabled = false;
  } else {
    activeCallName.textContent = 'Chưa có lượt gọi';
    activeCallNumber.textContent = '--';
    activeCallDetails.textContent = 'Chọn một bệnh nhân từ danh sách chờ bên dưới để gọi số vào khám';
    btnRepeat.disabled = true;
    btnFinish.disabled = true;
  }
}

function updateTVScreen() {
  const tvSpotlightSTT = document.getElementById('tvSpotlightSTT');
  const tvSpotlightName = document.getElementById('tvSpotlightName');
  const tvSpotlightRoom = document.getElementById('tvSpotlightRoom');
  const nextList = document.getElementById('tvNextPatientsList');
  const countText = document.getElementById('tvWaitingCountText');

  if (window.currentCallingPatient && window.currentCallingPatient.fullName) {
    tvSpotlightSTT.textContent = '#' + (window.currentCallingPatient.stt < 10 ? '0' + window.currentCallingPatient.stt : window.currentCallingPatient.stt);
    tvSpotlightName.textContent = window.currentCallingPatient.fullName;
    tvSpotlightRoom.innerHTML = `<i class="fa-solid fa-door-open text-teal-400"></i><span>${window.currentCallingPatient.room || 'Phòng Khám'}</span>`;
  } else {
    tvSpotlightSTT.textContent = '--';
    tvSpotlightName.textContent = 'Mời bệnh nhân kế tiếp';
    tvSpotlightRoom.innerHTML = `<i class="fa-solid fa-clock text-teal-400"></i><span>Hệ thống chuẩn bị gọi số</span>`;
  }

  const today = new Date().toISOString().split('T')[0];
  const waitingList = (window.appointments || []).filter(a => a.date === today && a.status === 'WAITING').sort((a,b) => a.stt - b.stt);

  countText.textContent = `${waitingList.length} người chờ`;
  nextList.innerHTML = '';

  if (waitingList.length === 0) {
    nextList.innerHTML = `<div class="text-center py-8 text-slate-500 text-xs">Hiện không còn bệnh nhân nào đang chờ</div>`;
  } else {
    waitingList.slice(0, 4).forEach((p) => {
      const item = document.createElement('div');
      item.className = 'flex items-center justify-between p-3.5 rounded-2xl bg-slate-900/80 border border-slate-700/60';
      item.innerHTML = `
        <div class="flex items-center space-x-3">
          <span class="w-9 h-9 rounded-xl bg-teal-500/20 text-teal-300 font-mono font-bold text-sm flex items-center justify-center">
            #${p.stt < 10 ? '0' + p.stt : p.stt}
          </span>
          <div>
            <div class="text-sm font-bold text-white">${p.fullName}</div>
            <div class="text-[11px] text-slate-400">${p.department}</div>
          </div>
        </div>
        <div class="text-right">
          <span class="text-xs font-semibold text-amber-400 font-mono">${p.timeSlot}</span>
          <div class="text-[10px] text-slate-400">Chuẩn bị sẵn sàng</div>
        </div>
      `;
      nextList.appendChild(item);
    });
  }
}

// 8. CAMERA QUÉT QR CHECK-IN
window.openScannerModal = function() {
  document.getElementById('scannerModal').classList.remove('hidden');
  document.getElementById('scannerPlaceholder').style.display = 'block';

  try {
    if (!qrScanner) {
      qrScanner = new Html5Qrcode('qrReader');
    }
    const config = { fps: 10, qrbox: { width: 220, height: 220 } };
    qrScanner.start({ facingMode: "environment" }, config, onScanSuccess, () => {})
      .then(() => {
        document.getElementById('scannerPlaceholder').style.display = 'none';
      })
      .catch(err => {
        console.warn('Camera error:', err);
        document.getElementById('scannerPlaceholder').innerHTML = `
          <i class="fa-solid fa-video-slash text-3xl mb-2 text-rose-400"></i>
          <p class="text-xs text-rose-300">Không thể bật camera (vui lòng cấp quyền truy cập).</p>
          <p class="text-[11px] text-slate-400 mt-1">Bạn có thể nhập trực tiếp mã phiếu ở ô bên dưới.</p>
        `;
      });
  } catch (e) {
    console.error(e);
  }
};

window.closeScannerModal = function() {
  document.getElementById('scannerModal').classList.add('hidden');
  if (qrScanner && qrScanner.isScanning) {
    qrScanner.stop().catch(err => console.error(err));
  }
};

function onScanSuccess(decodedText) {
  try {
    let code = decodedText;
    if (decodedText.startsWith('{')) {
      const parsed = JSON.parse(decodedText);
      code = parsed.id;
    }
    window.processCheckIn(code);
    window.closeScannerModal();
  } catch (e) {
    window.processCheckIn(decodedText);
    window.closeScannerModal();
  }
}

window.submitManualCheckIn = function() {
  const code = document.getElementById('manualCodeInput').value.trim();
  if (!code) {
    showToast('Vui lòng nhập mã phiếu khám', 'error');
    return;
  }
  window.processCheckIn(code);
  window.closeScannerModal();
};

window.processCheckIn = async function(code) {
  const cleanCode = code.replace(/['"]+/g, '').trim();
  const patient = window.appointments.find(a => a.id.toLowerCase() === cleanCode.toLowerCase());
  
  if (!patient) {
    showToast(`Không tìm thấy mã đăng ký "${cleanCode}" trên hệ thống!`, 'error');
    return;
  }

  if (patient.status === 'PENDING') {
    try {
      if (patient._key) {
        await update(ref(db, `appointments/${patient._key}`), {
          status: 'WAITING',
          checkInAt: new Date().toISOString()
        });
        showToast(`Check-in thành công: ${patient.fullName}! Đã đưa vào danh sách chờ khám.`, 'success');
      }
    } catch (e) {
      showToast('Lỗi cập nhật check-in: ' + e.message, 'error');
    }
  } else if (patient.status === 'WAITING') {
    showToast(`Bệnh nhân ${patient.fullName} đã check-in trước đó rồi.`, 'info');
  } else if (patient.status === 'COMPLETED') {
    showToast(`Phiếu khám ${patient.id} của ${patient.fullName} đã hoàn tất khám!`, 'info');
  }

  window.openPatientDetails(patient.id);
};

window.openPatientDetails = function(id) {
  const patient = window.appointments.find(a => a.id === id);
  if (!patient) return;

  document.getElementById('detailModalName').textContent = patient.fullName;
  document.getElementById('detailModalCode').textContent = `${patient.id} • STT #${patient.stt}`;

  const body = document.getElementById('detailModalBody');
  body.innerHTML = `
    <div class="grid grid-cols-2 gap-2 p-3 bg-slate-50 rounded-xl">
      <div><span class="text-slate-400">Số điện thoại:</span> <span class="font-semibold text-slate-800">${patient.phone}</span></div>
      <div><span class="text-slate-400">Tuổi:</span> <span class="font-semibold text-slate-800">${patient.age ? patient.age + ' tuổi' : 'Chưa rõ'}</span></div>
      <div><span class="text-slate-400">CCCD/CMND:</span> <span class="font-semibold text-slate-800">${patient.idCard || 'N/A'}</span></div>
      <div><span class="text-slate-400">Giới tính:</span> <span class="font-semibold text-slate-800">${patient.gender || 'N/A'}</span></div>
      <div class="col-span-2"><span class="text-slate-400">Ngày sinh:</span> <span class="font-semibold text-slate-800">${patient.dob || 'Chưa rõ'}</span></div>
    </div>
    <div class="p-3 bg-teal-50/50 rounded-xl space-y-1">
      <div class="text-teal-900 font-bold">${patient.department}</div>
      <div class="text-slate-600">${patient.room} • Khung giờ: <strong>${patient.timeSlot}</strong> (${patient.date})</div>
    </div>
    <div class="p-3 bg-slate-50 rounded-xl">
      <span class="font-semibold text-slate-700 block mb-1">Triệu chứng khai báo:</span>
      <p class="text-slate-600 italic bg-white p-2 rounded-lg border border-slate-200/60">${patient.symptoms || 'Không có triệu chứng ghi chú'}</p>
    </div>
  `;

  const callBtn = document.getElementById('modalCallPatientBtn');
  callBtn.onclick = function() {
    window.callSpecificPatient(patient.id);
    window.closeDetailsModal();
  };

  document.getElementById('patientDetailsModal').classList.remove('hidden');
};

window.closeDetailsModal = function() {
  document.getElementById('patientDetailsModal').classList.add('hidden');
};

// 9. ĐIỀU HƯỚNG TABS & TIỆN ÍCH
window.switchView = function(viewName) {
  const views = ['register', 'dashboard', 'screen'];
  views.forEach(v => {
    const el = document.getElementById('view' + v.charAt(0).toUpperCase() + v.slice(1));
    const btn = document.getElementById('nav' + v.charAt(0).toUpperCase() + v.slice(1) + 'Btn');
    if (v === viewName) {
      el.classList.remove('hidden');
      btn.classList.add('bg-white', 'text-slate-800', 'shadow-sm');
      btn.classList.remove('text-slate-600');
    } else {
      el.classList.add('hidden');
      btn.classList.remove('bg-white', 'text-slate-800', 'shadow-sm');
      btn.classList.add('text-slate-600');
    }
  });

  if (viewName === 'dashboard') {
    window.renderDashboardTable();
    updateStats();
  } else if (viewName === 'screen') {
    updateTVScreen();
  }
};

window.resetFilters = function() {
  document.getElementById('searchInput').value = '';
  document.getElementById('statusFilter').value = 'ALL';
  initDateInputs();
  window.renderDashboardTable();
  showToast('Đã đặt lại bộ lọc', 'info');
};

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  
  let bg = 'bg-slate-800 text-white';
  let icon = 'fa-info-circle';
  if (type === 'success') {
    bg = 'bg-emerald-600 text-white shadow-emerald-500/20';
    icon = 'fa-circle-check';
  } else if (type === 'error') {
    bg = 'bg-rose-600 text-white shadow-rose-500/20';
    icon = 'fa-triangle-exclamation';
  }

  toast.className = `${bg} px-4 py-3 rounded-2xl shadow-xl flex items-center space-x-2 text-xs font-semibold transform transition-all duration-300 pointer-events-auto border border-white/10`;
  toast.innerHTML = `<i class="fa-solid ${icon} text-sm"></i><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function initDateInputs() {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  
  const apptDate = document.getElementById('appointmentDate');
  const dateFilter = document.getElementById('dateFilter');
  if (apptDate) {
    apptDate.value = todayStr;
    apptDate.min = todayStr; // Khóa lùi ngày
    apptDate.addEventListener("change", () => {
      if (apptDate.value < todayStr) {
        showToast("Không được đặt lịch lùi về ngày trong quá khứ!", "error");
        apptDate.value = todayStr;
      }
      window.renderTimeSlotsByDate();
    });
  }
  if (dateFilter) dateFilter.value = todayStr;

  window.renderTimeSlotsByDate();
}

function startLiveClocks() {
  function tick() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('vi-VN', { hour12: false });
    const dateStr = now.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });

    const clockEl = document.getElementById('currentLiveClock');
    const tvClockEl = document.getElementById('tvDigitalClock');
    const tvDateEl = document.getElementById('tvDateDisplay');

    if (clockEl) clockEl.textContent = timeStr;
    if (tvClockEl) tvClockEl.textContent = timeStr;
    if (tvDateEl) tvDateEl.textContent = dateStr;
  }
  tick();
  setInterval(tick, 1000);
}

// Khởi chạy khi tải trang
initDateInputs();
setupAgeDobSync();
startLiveClocks();