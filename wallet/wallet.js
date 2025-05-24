
const qrBtn = document.getElementById('show-qr-btn');
const qrModal = document.getElementById('qr-modal');
const closeQr = document.getElementById('close-qr');
const qrCanvas = document.getElementById('qr-canvas');
const qrAddress = document.getElementById('qr-address');
const copyBtn = document.getElementById('copy-btn'); // Lấy nút Copy Address

qrBtn.addEventListener('click', () => {
  // Lấy địa chỉ đầy đủ từ data-full-address
  const fullAddress = document.getElementById('wallet-address').getAttribute("data-full-address");
  qrAddress.innerText = fullAddress;

  // Tạo mã QR từ địa chỉ đầy đủ
  QRCode.toCanvas(qrCanvas, fullAddress, { width: 300 }, function (error) {
    if (error) console.error(error);
  });

  qrModal.style.display = 'flex';
});

closeQr.addEventListener('click', () => {
  qrModal.style.display = 'none';
});

function copyAddress() {
  // Lấy địa chỉ đầy đủ từ data-full-address
  const fullAddress = document.getElementById("wallet-address").getAttribute("data-full-address");
  if (fullAddress) {
    // Sao chép địa chỉ đầy đủ vào clipboard
    navigator.clipboard.writeText(fullAddress).then(() => {
      // Thay đổi văn bản của nút thành "Copied!"
      copyBtn.innerText = "Copied!";
      
      // Sau 2 giây, thay đổi lại văn bản của nút về "Copy Address"
      setTimeout(() => {
        copyBtn.innerText = "Copy Address";
      }, 2000);
    }).catch((err) => {
      console.error("Không thể copy:", err);
    });
  }
}






















    // Tự động active tab đang mở
const currentPage = location.pathname.split("/").pop();
const items = document.querySelectorAll(".footer-item");

items.forEach(item => {
const page = item.getAttribute("data-page");
if (page === currentPage) {
item.classList.add("active");
}
});

const tg = window.Telegram.WebApp;
tg.ready();
// Nút back luôn luôn bật
    tg.BackButton.show();

    // Khi bấm vào nút back của Telegram
    tg.BackButton.onClick(() => {
      window.history.back(); // Quay lại trang trước khi người dùng mở trang này
    });
    
let balanceTon = 0; // Khai báo biến toàn cục để lưu số dư

const connector = new TON_CONNECT_UI.TonConnectUI({
  manifestUrl: "https://bmweb.site/tonconnect-manifest.json",
  buttonRootId: "connect-wallet"
});

connector.onStatusChange(async (wallet) => {
  if (wallet) {
    const rawAddress = wallet.account.address;

    document.getElementById("connect-only").style.display = "none";
    document.getElementById("main-content").style.display = "block";

    try {
      const res = await fetch(`https://toncenter.com/api/v2/getExtendedAddressInformation?address=${rawAddress}`);
      const data = await res.json();

      if (data.ok && data.result) {
        const accountAddress = data.result.address.account_address;
        const balanceNanoTON = parseInt(data.result.balance);
        balanceTon = safeParseNanoTON(balanceNanoTON); // Gán vào biến toàn cục

        document.getElementById("wallet-balance").textContent = `Balance: ${truncateDecimal(balanceTon)} TON`;
        document.getElementById("ton-amount").setAttribute("max", balanceTon);

        const shortAddress = accountAddress.slice(0, 8) + "..." + accountAddress.slice(-8);
        const walletAddressEl = document.getElementById("wallet-address");
        walletAddressEl.textContent = shortAddress;
        walletAddressEl.setAttribute("data-full-address", accountAddress);

        document.getElementById("disconnect").style.display = 'inline-block';

        fetchTransactionHistory(rawAddress);
      }
    } catch (err) {
      console.error("Lỗi khi tải thông tin:", err);
    }
  } else {
    document.getElementById("wallet-address").textContent = "...";
    document.getElementById("wallet-address").setAttribute("data-full-address", "");
    document.getElementById("wallet-balance").textContent = "Số dư: ... TON";
    document.getElementById("disconnect").style.display = 'none';
    document.getElementById("main-content").style.display = "none";
    document.getElementById("connect-only").style.display = "flex";
  }
});



// 👉 Gán full số dư vào input khi nhấn MAX
function setMaxTON() {
  if (balanceTon > 0) {
    document.getElementById("ton-amount").value = balanceTon;
  }
}






document.getElementById("disconnect").addEventListener("click", () => {
  connector.disconnect();
});

// Hàm để cắt bớt chữ số thập phân
function truncateDecimal(number) {
  return number % 1 !== 0 ? number.toFixed(9).replace(/0+$/, '').replace(/\.$/, '') : number.toFixed(0);
}

// Hàm để chuyển nanoTON sang TON
function safeParseNanoTON(value) {
  if (!value || isNaN(value)) return 0; // Kiểm tra giá trị hợp lệ
  return value / 1e9; // Chuyển từ nanoTON (1e9 nanoTON = 1 TON)
}

function base64ToHex(base64) {
  const raw = atob(base64.replace(/-/g, '+').replace(/\_/g, '/'));
  let result = '';
  for (let i = 0; i < raw.length; i++) {
    result += raw.charCodeAt(i).toString(16).padStart(2, '0');
  }
  return result;
}

function truncateBase64(addr) {
  return addr.length > 12 ? addr.slice(0, 4) + "…" + addr.slice(-4) : addr;
}

function toggleMemo(el) {
  el.classList.toggle("expanded");
}

async function fetchTransactionHistory(walletAddress) {
  try {
    const response = await fetch(`https://toncenter.com/api/v2/getTransactions?address=${walletAddress}&limit=40&to_lt=0&archival=false`);
    const data = await response.json();
    const list = document.getElementById("transactions-list");
    list.innerHTML = "";

    if (data && data.result && data.result.length > 0) {
      for (const tx of data.result) {
        const inMsg = tx.in_msg;
        const outMsgs = tx.out_msgs || [];

        const isReceived = inMsg && parseInt(inMsg.value) > 0;
        const isSent = outMsgs.length > 0 && parseInt(outMsgs[0].value) > 0;

        const fromAddress = isReceived ? inMsg.source : (isSent ? walletAddress : '');
        const toAddress = isSent ? outMsgs[0].destination : (isReceived ? walletAddress : '');

        const amountRaw = isReceived ? inMsg.value : (isSent ? outMsgs[0].value : "0");
        const amountTon = safeParseNanoTON(amountRaw); // Chuyển đổi số tiền từ nanoTON sang TON

        const time = new Date(tx.utime * 1000).toLocaleString(); // Chuyển đổi thời gian UTC sang định dạng người dùng
        const label = isReceived ? '' : (isSent ? '' : 'Unknown');
        const sign = isReceived ? '+ ' : (isSent ? '- ' : '');
        const iconPath = isReceived ? '/logo-coin/nhan.png' : (isSent ? '/logo-coin/gui.png' : '/logo-coin/loi.png');

        const memo = isReceived
          ? inMsg.message || 'No Memo/Comment'
          : (isSent ? outMsgs[0].message || 'No Memo/Comment' : 'Error');

        const txBase64 = tx.transaction_id?.hash || '';
        const txHex = base64ToHex(txBase64);
        const txLink = `https://tonviewer.com/transaction/${txHex}`;

        let labelText = '';
        if (isSent && toAddress) {
          labelText = `To: ${truncateBase64(toAddress)}`;
        } else if (isReceived && fromAddress) {
          labelText = `From: ${truncateBase64(fromAddress)}`;
        } else {
          labelText = label; // fallback
        }

        const li = document.createElement("li");
        li.className = "transaction-item";
        
        // Determine color for the amount
        const amountColor = isSent ? "red" : (isReceived ? "green" : "black"); // red for sent, green for received
        
        li.innerHTML = `
          <div class="row">
            <div class="icon-label">
              <span class="icon"><img src="${iconPath}" alt="icon"></span>
              <span>${labelText}</span>
            </div>
            <div class="amount" style="color: ${amountColor};">${sign}${truncateDecimal(amountTon)} TON</div>
          </div>
          <div class="row justify-between">
            <div class="address" title="${txHex}">
              <a href="${txLink}" target="_blank">🔎 Tonviewer</a>
            </div>
            <div class="time">${time}</div>
          </div>
          <div class="row justify-between">
            <div class="memo" onclick="toggleMemo(this)">${memo}</div>
          </div>
        `;

        // Add event listener for opening popup on click
        li.addEventListener("click", function() {
          openTransactionPopup(tx); // Open the popup with full transaction details
        });

        list.appendChild(li);
      }
    } else {
      list.innerHTML = `
        <div class="loading-spinner">
          <div class="spinner"></div>
          <div>Loading</div>
        </div>
      `;
    }
  } catch (error) {
    console.error("Error", error);
  }
}







function openTransactionPopup(tx) {
  closePopup(); // Đảm bảo không có popup cũ

  const popup = document.createElement("div");
  popup.className = "popup-overlay";

  const inMsg = tx.in_msg;
  const outMsgs = tx.out_msgs || [];

  const isReceived = inMsg && parseInt(inMsg.value) > 0;
  const isSent = outMsgs.length > 0 && parseInt(outMsgs[0].value) > 0;

  const amountRaw = isReceived ? inMsg.value : (isSent ? outMsgs[0].value : "0");
  const amountTon = safeParseNanoTON(amountRaw);

  const time = new Date(tx.utime * 1000).toLocaleString();
  const txBase64 = tx.transaction_id?.hash || '';
  const txHex = base64ToHex(txBase64);
  const txLink = `https://tonviewer.com/transaction/${txHex}`;
  const fee = safeParseNanoTON(tx.fee);
  const storageFee = safeParseNanoTON(tx.storage_fee);
  const otherFee = safeParseNanoTON(tx.other_fee);

  const fromAddress = inMsg?.source || "Unknown";
  const toAddress = outMsgs.length > 0
    ? outMsgs[0].destination
    : (inMsg?.destination || "Unknown");

  const memo = isReceived
    ? inMsg?.message || "No Memo/Comment"
    : (isSent && outMsgs[0]?.message) || "No Memo/Comment";

  const directionInfo = isSent
    ? `<p><strong>To Address:</strong> ${truncateBase64(toAddress)}</p>`
    : (isReceived
        ? `<p><strong>From Address:</strong> ${truncateBase64(fromAddress)}</p>`
        : '');

  popup.innerHTML = `
    <div class="popup-content">
      <button class="popup-close" onclick="closePopup()"></button>
      <h2>Transaction Details</h2>
      <p><strong>Transaction ID:</strong> ${txHex}</p>
      <p><strong>Amount:</strong> ${truncateDecimal(amountTon)} TON</p>
      <p><strong>Fee:</strong> ${truncateDecimal(fee)} TON</p>
      <p><strong>Storage Fee:</strong> ${truncateDecimal(storageFee)} TON</p>
      <p><strong>Other Fee:</strong> ${truncateDecimal(otherFee)} TON</p>
      ${directionInfo}
      <p><strong>Memo:</strong> ${memo}</p>
      <p><strong>Transaction Time:</strong> ${time}</p>
      <p><strong>View on Tonviewer:</strong> <a href="${txLink}" target="_blank">🔎 Click Here</a></p>
    </div>
  `;

  document.body.appendChild(popup);


  // Mở popup
  document.body.appendChild(popup);

  // Thêm sự kiện để đóng popup khi click vào overlay
  popup.addEventListener('click', function(event) {
    if (event.target === popup) {
      closePopup();
    }
  });
}

function closePopup() {
  const popup = document.querySelector(".popup-overlay");
  if (popup) popup.remove();
}







    

// Hàm mở rộng hoặc thu gọn memo
function toggleMemo(element) {
  element.classList.toggle("expanded");
}

















document.getElementById("send-ton-btn").addEventListener("click", async () => {
    const toAddress = document.getElementById("to-address").value.trim();
    const amountTON = parseFloat(document.getElementById("ton-amount").value);
    const memo = document.getElementById("memo-text").value.trim();

    // Giả sử maxAmount được lấy từ balanceTon, tương tự như đoạn mã thứ hai
    // Bạn cần đảm bảo 'balanceTon' và các hàm 'truncateDecimal', 'formatNumberVietnamese', 
    // 'convertRawAddressToB64url', 'truncateAddress' có sẵn hoặc tự định nghĩa.
    const maxAmount = parseFloat(document.getElementById("ton-amount").getAttribute("max")); 

    if (!toAddress || isNaN(amountTON) || amountTON <= 0) {
        Swal.fire({
            icon: 'warning',
            html: '<strong>Vui lòng nhập địa chỉ và số lượng hợp lệ.</strong>',
            position: 'center', // Đã đổi từ 'top-right' sang 'center'
            toast: false,       // Bỏ 'toast: true' hoặc đặt thành 'false'
            timer: 3500,
            showConfirmButton: false,
            padding: '10px',
            customClass: {
                popup: 'swal-popup-custom'
            }
        });
        return;
    }

    if (amountTON > maxAmount) {
        Swal.fire({
            icon: 'error',
            html: `Bạn chỉ có thể gửi tối đa <strong>${truncateDecimal(maxAmount)}</strong> TON.`, 
            position: 'center', // Đã đổi từ 'top-right' sang 'center'
            toast: false,       // Bỏ 'toast: true' hoặc đặt thành 'false'
            timer: 3500,
            showConfirmButton: false,
            padding: '10px',
            customClass: {
                popup: 'swal-popup-custom'
            }
        });
        return;
    }

    // Phần này cần các hàm hỗ trợ từ đoạn code thứ hai, ví dụ: convertRawAddressToB64url
    // và popup xác nhận trước khi gửi.
    // Vì không có các hàm này trong đoạn code đầu tiên, tôi sẽ giả định `toAddressB64url` 
    // chính là `toAddress` và bỏ qua phần xác nhận chi tiết để tập trung vào việc chỉnh sửa style.

    try {
        const amountNanoTON = BigInt(amountTON * 1e9);

        // Hiển thị popup loading trước khi gửi giao dịch
        Swal.fire({
            title: 'Đang gửi giao dịch...',
            html: `
                <div class="swal2-loading-spinner"></div>
                <p>Vui lòng mở ví TON của bạn để xác nhận giao dịch.</p>
                <br>
                <small style="color: #888;">Số lượng: <strong>${truncateDecimal(amountTON)} TON</strong></small><br>
                <small style="color: #888;">Đến: <strong>${toAddress}</strong></small>
            `,
            allowOutsideClick: false, 
            allowEscapeKey: false,   
            showConfirmButton: false, 
            customClass: {
                popup: 'swal-popup-custom'
            },
            didOpen: () => {}
        });

        const tx = {
            validUntil: Math.floor(Date.now() / 1000) + 60,
            messages: [{
                address: toAddress,
                amount: amountNanoTON.toString(),
                payload: memo ? TON_CONNECT_UI.textToPayload(memo) : undefined
            }]
        };

        const result = await connector.sendTransaction(tx);

        Swal.close(); // Đóng popup loading

        Swal.fire({
            icon: 'success',
            title: 'Giao dịch thành công!',
            html: `Bạn đã gửi thành công <strong>${truncateDecimal(amountTON)}</strong> TON<br>đến địa chỉ <strong>${toAddress}</strong>.`,
            position: 'center', // Đã đổi từ 'top-right' sang 'center'
            toast: false,       // Bỏ 'toast: true' hoặc đặt thành 'false'
            timer: 5000, 
            showConfirmButton: false,
            padding: '10px',
            customClass: {
                popup: 'swal-popup-custom'
            }
        });

        console.log("Result:", result);

        // Các dòng này có thể thêm vào nếu bạn muốn cập nhật giao diện sau giao dịch thành công
        // document.getElementById("to-address").value = '';
        // document.getElementById("ton-amount").value = '';
        // document.getElementById("memo-text").value = '';

    } catch (err) {
        Swal.close(); // Đóng popup loading nếu có lỗi
        console.error("Error while sending TON:", err);
        let errorMessage = '<strong>Đã xảy ra lỗi không xác định. Vui lòng thử lại.</strong>';
        
        if (err.message) {
            if (err.message.includes('User rejected the transaction')) {
                errorMessage = '<strong>Giao dịch đã bị từ chối bởi người dùng trong ví.</strong>';
            } else if (err.message.includes('Failed to send transaction') || err.message.includes('network')) {
                errorMessage = '<strong>Không thể gửi giao dịch. Vui lòng kiểm tra kết nối mạng và số dư ví của bạn.</strong>';
            } else {
                errorMessage = `<strong>Lỗi:</strong> ${err.message}`;
            }
        }

        Swal.fire({
            icon: 'error',
            title: 'Giao dịch thất bại!',
            html: errorMessage,
            position: 'center', // Đã đổi từ 'top-right' sang 'center'
            toast: false,       // Bỏ 'toast: true' hoặc đặt thành 'false'
            timer: 5000,
            showConfirmButton: false,
            padding: '10px',
            customClass: {
                popup: 'swal-popup-custom'
            }
        });
    }
});


















  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        document.getElementById("to-address").value = text.trim();
      } else {
        alert("Không tìm thấy nội dung nào trong clipboard.");
      }
    } catch (err) {
      alert("Trình duyệt không cho phép truy cập clipboard.\nHãy thử dán thủ công: Ctrl + V.");
    }
  }
