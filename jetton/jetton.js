// --- Cấu hình ứng dụng ---
const APP_CONFIG = {
    SWAL_TOAST_DURATION: 2500, // Thời gian hiển thị toast SweetAlert2
    JETTON_DEFAULT_DECIMALS: 9, // Decimals mặc định nếu không lấy được
    API_RETRY_DELAY: 1500, // Độ trễ giữa các lần thử lại API
    MAX_API_RETRIES: 3 // Số lần thử lại API tối đa
};

// --- Liên kết bên ngoài ---
const EXTERNAL_LINKS = {
    TONVIEWER_JETTON: (walletAddress, jettonAddress) => `https://tonviewer.com/${walletAddress}/jetton/${jettonAddress}`,
    TONVIEWER_TRANSACTION: (boc) => `https://tonviewer.com/transaction/${boc}` // Cần hash hoặc boc của giao dịch
};

// --- DOM Element Caching (Bộ nhớ đệm phần tử DOM) ---
// Các phần tử đã có
const loadingSpinner = document.getElementById('loading-spinner');
const jettonsList = document.getElementById('jettons-list');
const zeroBalanceList = document.getElementById('zero-balance-list');
const seeAllBtn = document.getElementById('see-all-btn');
const tokenHeader = document.getElementById('token-header');
const connectOnlyDiv = document.getElementById('connect-only');
const disconnectButton = document.getElementById('disconnect-wallet');
const friendlyAddressSpan = document.getElementById('friendly-address');
const copyFriendlyIcon = document.getElementById('copy-friendly-icon');
const walletBalanceEl = document.getElementById('wallet-balance');
const toAddressInput = document.getElementById('to-address');
const tonAmountInput = document.getElementById('ton-amount');
const memoTextInput = document.getElementById('memo-text');
const sendTonBtn = document.getElementById('send-ton-btn');
const jettonInfoPopup = document.getElementById('jetton-info-popup');
const jettonInfoContainer = document.getElementById('jetton-info-container');
const jettonInfoCloseBtn = document.getElementById('jetton-info-close-btn');

// Các phần tử mới thêm
const jettonAddressInput = document.getElementById("jetton-address"); // Có thể không cần nếu dùng select
const jettonAmountInput = document.getElementById("jetton-amount");
const sendJettonBtn = document.getElementById("send-jetton-btn");
const maxTonBtn = document.getElementById("max-ton-btn");
const maxJettonBtn = document.getElementById("max-jetton-btn");
const jettonSendSection = document.getElementById("jetton-send-section");
const tonSendSection = document.getElementById("ton-send-section");
const showTonSendBtn = document.getElementById("show-ton-send-btn");
const showJettonSendBtn = document.getElementById("show-jetton-send-btn");
const txDetailPopup = document.getElementById('transaction-detail-popup');
const txDetailCloseBtn = document.getElementById('transaction-detail-close-btn');
const txDetailContent = document.getElementById('transaction-detail-content');
const sendTypeToggle = document.getElementById('send-type-toggle'); // Button/toggle để chuyển đổi gửi TON/Jetton
const selectedJettonDisplay = document.getElementById('selected-jetton-display'); // Để hiển thị jetton đã chọn
const selectJettonBtn = document.getElementById('select-jetton-btn'); // Nút để mở danh sách chọn jetton
const jettonListForSelection = document.getElementById('jetton-list-for-selection'); // Danh sách jetton trong popup chọn

// --- Biến toàn cục ---
const tg = Telegram.WebApp;
let connector = null; // Sẽ được gán khi TonConnectUI sẵn sàng
let currentConnectedWalletAddressRaw = null; // Lưu địa chỉ ví raw của ví đang kết nối
let balanceTon = 0; // Số dư TON hiện tại
let allLoadedJettons = []; // Lưu trữ tất cả jetton (cả 0 balance) để sử dụng trong popup chọn gửi
let selectedJettonForSend = null; // Lưu trữ jetton được chọn để gửi (object đầy đủ)

// --- Khởi tạo Telegram Web App ---
tg.ready();
tg.BackButton.show();
tg.BackButton.onClick(() => {
    // Xử lý logic back button
    if (jettonInfoPopup.style.display === 'block') {
        jettonInfoPopup.style.display = 'none';
    } else if (txDetailPopup.style.display === 'block') {
        txDetailPopup.style.display = 'none';
    } else {
        window.history.back();
    }
});

// Lấy thông tin người dùng Telegram (nếu có)
const user = tg.initDataUnsafe?.user;
if (user) {
    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
    const avatarUrl = user.username
        ? `https://t.me/i/userpic/320/${user.username}.jpg`
        : '';

    const nameEl = document.getElementById('telegram-name');
    const avatarEl = document.getElementById('telegram-avatar');

    nameEl.textContent = fullName || user.username || "Người dùng";
    if (avatarUrl) {
        avatarEl.src = avatarUrl;
        avatarEl.style.display = 'inline-block';
    }
}

// --- Khởi tạo TonConnectUI ---
connector = new TON_CONNECT_UI.TonConnectUI({
    manifestUrl: 'https://bmweb.site/tonconnect-manifest.json',
    buttonRootId: 'connect-wallet'
});

// --- Hàm tiện ích chung ---
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Định dạng số theo chuẩn tiếng Việt, giới hạn số chữ số thập phân.
 * @param {number} num Số cần định dạng.
 * @param {number} maxFractionDigits Số chữ số thập phân tối đa. Mặc định 3.
 * @returns {string} Chuỗi đã định dạng.
 */
function formatNumberVietnamese(num, maxFractionDigits = 3) {
    if (typeof num !== 'number' || isNaN(num)) {
        return '0';
    }
    return num.toLocaleString("vi-VN", { maximumFractionDigits: maxFractionDigits });
}

/**
 * Rút gọn địa chỉ ví.
 * @param {string} address Địa chỉ đầy đủ.
 * @returns {string} Địa chỉ rút gọn.
 */
function truncateAddress(address) {
    if (!address || address.length < 16) return address;
    return `${address.slice(0, 8)}...${address.slice(-8)}`;
}

// Cache để lưu trữ kết quả chuyển đổi địa chỉ
const addressCache = new Map();

/**
 * Chuyển đổi địa chỉ raw sang địa chỉ bounceable B64URL.
 * Sử dụng cache để tránh gọi API nhiều lần.
 * @param {string} rawAddress Địa chỉ raw.
 * @returns {Promise<string>} Địa chỉ B64URL hoặc null nếu thất bại.
 */
async function convertRawAddressToB64url(rawAddress) {
    if (addressCache.has(rawAddress)) {
        return addressCache.get(rawAddress);
    }

    // Kiểm tra nếu địa chỉ đã là friendly format
    if (rawAddress.includes(':')) {
        addressCache.set(rawAddress, rawAddress);
        return rawAddress;
    }

    for (let i = 0; i < APP_CONFIG.MAX_API_RETRIES; i++) {
        try {
            const res = await fetch(`https://toncenter.com/api/v2/detectAddress?address=${rawAddress}`);
            const data = await res.json();
            if (data.ok && data.result && data.result.non_bounceable) {
                const b64url = data.result.non_bounceable.b64url;
                addressCache.set(rawAddress, b64url);
                return b64url;
            }
        } catch (error) {
            console.error(`Attempt ${i + 1} failed to convert address:`, error);
            if (i < APP_CONFIG.MAX_API_RETRIES - 1) {
                await delay(APP_CONFIG.API_RETRY_DELAY);
            }
        }
    }
    return null; // Trả về null nếu tất cả các lần thử thất bại
}

/**
 * Displays a SweetAlert2 toast notification.
 * @param {'success' | 'error' | 'warning' | 'info'} icon The icon type.
 * @param {string} htmlContent The HTML content for the toast.
 * @param {number} duration The duration in milliseconds. Defaults to APP_CONFIG.SWAL_TOAST_DURATION.
 */
function displayToast(icon, htmlContent, duration = APP_CONFIG.SWAL_TOAST_DURATION) {
    Swal.fire({
        icon: icon,
        html: htmlContent,
        position: 'top-right',
        toast: true,
        timer: duration,
        showConfirmButton: false,
        padding: '10px',
        customClass: {
            popup: 'swal-popup-custom'
        }
    });
}

/**
 * Shows a SweetAlert2 loading dialog.
 * @param {string} title The title of the dialog.
 * @param {string} html The HTML content for the dialog.
 */
function showLoadingSwal(title, html) {
    Swal.fire({
        title: title,
        html: html,
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        customClass: {
            popup: 'swal-popup-custom'
        },
        didOpen: () => {
            Swal.showLoading();
        }
    });
}

// --- Hàm xử lý gửi TON/Jetton ---
async function handleSendMessage(type) {
    tg.HapticFeedback.impactOccurred('light'); // Hiệu ứng rung nhẹ

    let toAddress, amount, memo, jettonAddress, jettonDecimals, jettonSymbol, currentBalance;
    let transactionTypeDisplay = type === 'TON' ? 'TON' : 'Jetton';

    if (type === 'TON') {
        toAddress = toAddressInput.value.trim();
        amount = parseFloat(tonAmountInput.value);
        memo = memoTextInput.value.trim();
        currentBalance = balanceTon;
    } else if (type === 'JETTON') {
        toAddress = toAddressInput.value.trim(); // Địa chỉ nhận vẫn dùng chung
        amount = parseFloat(jettonAmountInput.value);
        memo = memoTextInput.value.trim(); // Memo vẫn dùng chung

        if (!selectedJettonForSend) {
            displayToast('error', '<strong>Vui lòng chọn một Jetton để gửi.</strong>');
            return;
        }
        jettonAddress = selectedJettonForSend.jettonAddressRaw;
        jettonDecimals = selectedJettonForSend.jetton.decimals || APP_CONFIG.JETTON_DEFAULT_DECIMALS;
        jettonSymbol = selectedJettonForSend.jetton.symbol || "JETTON";
        currentBalance = parseFloat(selectedJettonForSend.balance) / Math.pow(10, jettonDecimals);
    }

    // --- 1. Kiểm tra đầu vào ---
    if (!toAddress || isNaN(amount) || amount <= 0) {
        Swal.fire({
            icon: 'warning',
            html: `<strong>Vui lòng nhập địa chỉ và số lượng ${transactionTypeDisplay} hợp lệ.</strong>`,
            position: 'center',
            toast: false,
            timer: 3500,
            showConfirmButton: false,
            padding: '10px',
            customClass: { popup: 'swal-popup-custom' }
        });
        return;
    }

    if (amount > currentBalance) {
        Swal.fire({
            icon: 'error',
            html: `Bạn chỉ có thể gửi tối đa <strong>${formatNumberVietnamese(currentBalance)}</strong> ${transactionTypeDisplay}.`,
            position: 'center',
            toast: false,
            timer: 3500,
            showConfirmButton: false,
            padding: '10px',
            customClass: { popup: 'swal-popup-custom' }
        });
        return;
    }

    let toAddressB64url;
    try {
        toAddressB64url = await convertRawAddressToB64url(toAddress);
        if (!toAddressB64url) {
            console.error("Invalid recipient address format after conversion attempt:", toAddress);
            Swal.fire({
                icon: 'error',
                html: '<strong>Định dạng địa chỉ người nhận không hợp lệ. Vui lòng kiểm tra lại địa chỉ.</strong>',
                position: 'center',
                toast: false,
                timer: 4000,
                showConfirmButton: false,
                padding: '10px',
                customClass: { popup: 'swal-popup-custom' }
            });
            return;
        }
    } catch (conversionError) {
        console.error("Error during address conversion:", conversionError);
        Swal.fire({
            icon: 'error',
            html: '<strong>Có lỗi khi xử lý địa chỉ. Vui lòng thử lại.</strong>',
            position: 'center',
            toast: false,
            timer: 4000,
            showConfirmButton: false,
            padding: '10px',
            customClass: { popup: 'swal-popup-custom' }
        });
        return;
    }

    // --- 2. Hiển thị popup xác nhận giao dịch ---
    const confirmResult = await Swal.fire({
        title: 'Xác nhận giao dịch',
        html: `Bạn sắp gửi <strong>${formatNumberVietnamese(amount)}</strong> ${type === 'TON' ? 'TON' : jettonSymbol} đến <strong>${truncateAddress(toAddressB64url)}</strong>.${memo ? `<br>Ghi chú: <em>${memo}</em>` : ''}<br><br>Bạn có chắc chắn muốn gửi?`,
        icon: 'info',
        showCancelButton: true,
        confirmButtonText: 'Gửi ngay',
        cancelButtonText: 'Hủy bỏ',
        reverseButtons: true,
        customClass: { popup: 'swal-popup-custom' }
    });

    if (!confirmResult.isConfirmed) {
        displayToast('info', '<strong>Giao dịch đã bị hủy.</strong>', 3000);
        return;
    }

    // --- 3. Nếu người dùng nhấn "Gửi ngay", hiển thị popup loading mới ---
    showLoadingSwal('Đang gửi giao dịch...', `
        <div class="swal2-loading-spinner"></div>
        <p>Vui lòng mở ví TON của bạn để xác nhận giao dịch.</p>
        <br>
        <small style="color: #888;">Số lượng: <strong>${formatNumberVietnamese(amount)} ${type === 'TON' ? 'TON' : jettonSymbol}</strong></small><br>
        <small style="color: #888;">Đến: <strong>${truncateAddress(toAddressB64url)}</strong></small>
    `);

    try {
        let tx;
        if (type === 'TON') {
            const amountNanoTON = BigInt(Math.round(amount * 1e9));
            tx = {
                validUntil: Math.floor(Date.now() / 1000) + 60,
                messages: [{
                    address: toAddressB64url,
                    amount: amountNanoTON.toString(),
                    payload: memo ? TON_CONNECT_UI.textToPayload(memo) : undefined
                }]
            };
        } else if (type === 'JETTON') {
            const amountNanoJetton = BigInt(Math.round(amount * Math.pow(10, jettonDecimals)));
            tx = {
                validUntil: Math.floor(Date.now() / 1000) + 60,
                messages: [{
                    address: jettonAddress, // Địa chỉ Jetton Master
                    amount: '1', // Phí cho contract của Jetton (thường là 1 nanoTON)
                    payload: {
                        boc: await connector.createJettonTransferPayload({ // Sử dụng connector
                            queryId: Math.floor(Math.random() * 2 ** 32), // Random queryId
                            amount: amountNanoJetton.toString(),
                            destination: toAddressB64url,
                            responseAddress: currentConnectedWalletAddressRaw, // Địa chỉ ví của người gửi để nhận lại gas nếu có
                            forwardPayload: memo ? connector.textToPayload(memo) : undefined, // Sử dụng connector
                            forwardAmount: '1' // Phí chuyển tiếp (thường là 1 nanoTON)
                        })
                    }
                }]
            };
        }

        const result = await connector.sendTransaction(tx);
        Swal.close();
        displayToast('success', `<strong>Giao dịch ${transactionTypeDisplay} thành công!</strong><br>Bạn đã gửi thành công <strong>${formatNumberVietnamese(amount)}</strong> ${type === 'TON' ? 'TON' : jettonSymbol}<br>đến địa chỉ <strong>${truncateAddress(toAddressB64url)}</strong>.<br><a href="${EXTERNAL_LINKS.TONVIEWER_TRANSACTION(result.boc)}" target="_blank">Xem trên Tonviewer</a>`, 8000);

        console.log("Transaction Result:", result);

        if (connector.wallet?.account?.address) {
            await updateWalletInfo(connector.wallet.account.address); // Cập nhật tổng quan ví
            await fetchJettons(connector.wallet.account.address); // Cập nhật Jetton sau khi gửi
        }

        // Reset inputs
        toAddressInput.value = '';
        tonAmountInput.value = '';
        jettonAmountInput.value = '';
        memoTextInput.value = '';
        if (type === 'JETTON') {
            selectedJettonDisplay.textContent = 'Chọn Jetton';
            selectedJettonForSend = null;
            jettonAmountInput.value = ''; // Đảm bảo clear jetton amount
            jettonAmountInput.setAttribute("max", "0"); // Reset max
        }

    } catch (err) {
        Swal.close();
        console.error("Error while sending transaction:", err);
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
            title: `Giao dịch ${transactionTypeDisplay} thất bại!`,
            html: errorMessage,
            position: 'center',
            toast: false,
            timer: 5000,
            showConfirmButton: false,
            padding: '10px',
            customClass: { popup: 'swal-popup-custom' }
        });
    }
}

// Gán sự kiện click cho các nút gửi
sendTonBtn.onclick = () => handleSendMessage('TON');
if (sendJettonBtn) { // Kiểm tra để tránh lỗi nếu DOM chưa có
    sendJettonBtn.onclick = () => handleSendMessage('JETTON');
}


// --- Hàm cập nhật thông tin ví tổng quan ---
async function updateWalletInfo(rawAddress) {
    currentConnectedWalletAddressRaw = rawAddress; // Lưu địa chỉ ví hiện tại

    try {
        let tonData;
        for (let i = 0; i < APP_CONFIG.MAX_API_RETRIES; i++) {
            try {
                const tonRes = await fetch(`https://tonapi.io/v2/accounts/${rawAddress}`);
                tonData = await tonRes.json();
                if (tonData && tonData.balance) break;
            } catch (error) {
                console.error(`Attempt ${i + 1} failed to fetch TON balance:`, error);
                if (i < APP_CONFIG.MAX_API_RETRIES - 1) {
                    await delay(APP_CONFIG.API_RETRY_DELAY);
                } else {
                    throw new Error("Failed to fetch TON balance after multiple retries.");
                }
            }
        }

        balanceTon = parseFloat(tonData.balance) / 1e9;
        walletBalanceEl.textContent = `Balance: ${formatNumberVietnamese(balanceTon)} TON`;
        tonAmountInput.setAttribute("max", balanceTon); // Set max cho TON amount
        maxTonBtn.onclick = () => { // Thêm sự kiện cho nút Max TON
            tg.HapticFeedback.impactOccurred('light');
            tonAmountInput.value = balanceTon;
        };

        // Lấy địa chỉ thân thiện
        await loadFriendlyAddress(rawAddress);

    } catch (err) {
        console.error('Error updating wallet info:', err);
        displayToast('error', `<strong>Lỗi khi tải thông tin ví:</strong> ${err.message || 'Không xác định'}`);
        resetWalletUI(); // Đảm bảo reset UI nếu có lỗi nghiêm trọng
    }
}

// --- Hàm tải và hiển thị địa chỉ thân thiện ---
async function loadFriendlyAddress(walletAddress) {
    friendlyAddressSpan.textContent = "Đang tải địa chỉ...";
    try {
        const friendlyAddr = await convertRawAddressToB64url(walletAddress);
        if (friendlyAddr) {
            const shortFriendly = truncateAddress(friendlyAddr);
            friendlyAddressSpan.textContent = shortFriendly;

            const copyFriendly = () => {
                tg.HapticFeedback.impactOccurred('light');
                navigator.clipboard.writeText(friendlyAddr).then(() => {
                    displayToast('success', '<strong>Đã sao chép địa chỉ ví!</strong>');
                }).catch(() => {
                    displayToast('error', '<strong>Thất bại khi sao chép.</strong>');
                });
            };

            friendlyAddressSpan.onclick = copyFriendly;
            copyFriendlyIcon.onclick = copyFriendly;
            copyFriendlyIcon.style.display = 'inline-block'; // Hiện icon copy
        } else {
            friendlyAddressSpan.textContent = "Không thể lấy địa chỉ.";
            copyFriendlyIcon.style.display = 'none';
        }
    } catch (err) {
        friendlyAddressSpan.textContent = "Lỗi API.";
        copyFriendlyIcon.style.display = 'none';
        console.error('Error loading friendly address:', err);
    }
}

// --- Hàm tải và hiển thị Jettons ---
async function fetchJettons(walletAddress) {
    loadingSpinner.style.display = 'block';
    jettonsList.innerHTML = '';
    zeroBalanceList.innerHTML = '';
    zeroBalanceList.style.display = 'none';
    seeAllBtn.style.display = 'none';
    tokenHeader.style.display = 'none'; // Ẩn header cho đến khi có token

    try {
        // Lấy số dư TON, giá TON/USDT, BTC/USDT, ETH/USDT và tỷ giá USDT/VND cùng lúc
        const [
            tonRes, okxTonRes, okxBtcRes, okxEthRes, vndRes, jettonsRes
        ] = await Promise.all([
            fetch(`https://tonapi.io/v2/accounts/${walletAddress}`),
            fetch('https://www.okx.com/api/v5/market/ticker?instId=TON-USDT'),
            fetch('https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT'),
            fetch('https://www.okx.com/api/v5/market/ticker?instId=ETH-USDT'),
            fetch('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=vnd'),
            fetch(`https://tonapi.io/v2/accounts/${walletAddress}/jettons?currencies=usdt`)
        ]);

        const tonData = await tonRes.json();
        const okxTonData = await okxTonRes.json();
        const okxBtcData = await okxBtcRes.json();
        const okxEthData = await okxEthRes.json();
        const vndData = await vndRes.json();
        const jettonApiData = await jettonsRes.json();

        const usdtToVnd = vndData.tether.vnd;

        // Xử lý TON
        const tonBalance = parseFloat(tonData.balance) / 1e9;
        const tonPrice = parseFloat(okxTonData.data[0].last);
        const tonOpen = parseFloat(okxTonData.data[0].open24h);
        const tonChange = ((tonPrice - tonOpen) / tonOpen) * 100;
        const tonChangeSign = tonChange >= 0 ? '+' : '';
        const tonValueInUSDT = tonBalance * tonPrice;
        const tonValueInVND = tonValueInUSDT * usdtToVnd;

        const tonHTML = `
            <div class="jetton-item">
                <div class="jetton-logo-wrapper">
                    <img src="/logo-coin/ton.jpg" alt="TON" class="jetton-logo">
                    <img src="/logo-coin/ton.jpg" alt="TON Network" class="jetton-network-badge">
                </div>
                <div class="jetton-info">
                    <strong>TON
                        <img src="https://upload.wikimedia.org/wikipedia/commons/e/e4/Twitter_Verified_Badge.svg" alt="verified" width="16" class="verified-badge">
                    </strong>
                    <p>
                        ${tonBalance.toLocaleString("vi-VN", { maximumFractionDigits: 9 })} TON ≈ 
                        $${tonValueInUSDT.toLocaleString("en-US", { minimumFractionDigits: 2 })} ≈ 
                        ${tonValueInVND.toLocaleString("vi-VN", { style: 'currency', currency: 'VND' })}
                    </p>
                    <p style="color: ${tonChange >= 0 ? 'green' : 'red'};">
                        $${tonPrice.toFixed(3)} ≈ ${ (tonPrice * usdtToVnd).toLocaleString("vi-VN", { style: "currency", currency: "VND" }) }
                        (${tonChangeSign}${tonChange.toFixed(2)}%)
                    </p>
                </div>
            </div>
        `;
        jettonsList.innerHTML += tonHTML;

        // Xử lý BTC
        const btcPrice = parseFloat(okxBtcData.data[0].last);
        const btcOpen = parseFloat(okxBtcData.data[0].open24h);
        const btcChange = ((btcPrice - btcOpen) / btcOpen) * 100;
        const btcChangeSign = btcChange >= 0 ? '+' : '';
        const btcPriceVND = btcPrice * usdtToVnd;
        const btcHTML = `
            <div class="jetton-item">
                <div class="jetton-logo-wrapper">
                    <img src="/logo-coin/btc.jpg" alt="BTC" class="jetton-logo">
                    <img src="/logo-coin/btc.jpg" alt="Bitcoin Network" class="jetton-network-badge">
                </div>
                <div class="jetton-info">
                    <strong>BTC
                        <img src="https://upload.wikimedia.org/wikipedia/commons/e/e4/Twitter_Verified_Badge.svg" alt="verified" width="16" class="verified-badge">
                    </strong>
                    <p>
                        $${btcPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })} ≈ 
                        ${btcPriceVND.toLocaleString("vi-VN", { style: 'currency', currency: 'VND' })}
                        <span style="color: ${btcChange >= 0 ? 'green' : 'red'};">
                            (${btcChangeSign}${btcChange.toFixed(2)}%)
                        </span>
                    </p>
                </div>
            </div>
        `;
        jettonsList.innerHTML += btcHTML;

        // Xử lý ETH
        const ethPrice = parseFloat(okxEthData.data[0].last);
        const ethOpen = parseFloat(okxEthData.data[0].open24h);
        const ethChange = ((ethPrice - ethOpen) / ethOpen) * 100;
        const ethChangeSign = ethChange >= 0 ? '+' : '';
        const ethPriceVND = ethPrice * usdtToVnd;
        const ethHTML = `
            <div class="jetton-item">
                <div class="jetton-logo-wrapper">
                    <img src="/logo-coin/eth.jpg" alt="ETH" class="jetton-logo">
                    <img src="/logo-coin/eth.jpg" alt="Ethereum Network" class="jetton-network-badge">
                </div>
                <div class="jetton-info">
                    <strong>ETH
                        <img src="https://upload.wikimedia.org/wikipedia/commons/e/e4/Twitter_Verified_Badge.svg" alt="verified" width="16" class="verified-badge">
                    </strong>
                    <p>
                        $${ethPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })} ≈ 
                        ${ethPriceVND.toLocaleString("vi-VN", { style: 'currency', currency: 'VND' })}
                        <span style="color: ${ethChange >= 0 ? 'green' : 'red'};">
                            (${ethChangeSign}${ethChange.toFixed(2)}%)
                        </span>
                    </p>
                </div>
            </div>
        `;
        jettonsList.innerHTML += ethHTML;

        // Xử lý Jettons
        loadingSpinner.style.display = 'none';

        if (!jettonApiData.balances || jettonApiData.balances.length === 0) {
            tokenHeader.style.display = 'none';
        } else {
            tokenHeader.style.display = 'block';
        }

        allLoadedJettons = []; // Reset danh sách jetton để chọn gửi
        const zeroBalanceJettonsHTML = [];
        let totalJettonValueInUSDT = 0;

        for (const jetton of jettonApiData.balances) {
            // Chuẩn hóa Jetton object để lưu trữ, thêm rawAddress để dễ dùng
            const jettonObj = {
                ...jetton,
                jettonAddressRaw: jetton.jetton.address // Lưu địa chỉ raw để truy cập sau
            };
            allLoadedJettons.push(jettonObj);

            const decimals = jetton.jetton.decimals || APP_CONFIG.JETTON_DEFAULT_DECIMALS;
            const balance = parseFloat(jetton.balance) / (10 ** decimals);
            const formattedBalance = balance.toLocaleString("vi-VN", {
                minimumFractionDigits: 0,
                maximumFractionDigits: decimals > 5 ? 5 : decimals
            });

            const name = jetton.jetton.name || 'Unknown';
            const symbol = jetton.jetton.symbol || '???';
            let image = jetton.jetton.image || '/logo-coin/loi.png'; // Fallback image
            if (image.startsWith('ipfs://')) {
                image = image.replace('ipfs://', 'https://cloudflare-ipfs.com/ipfs/');
            }
            const jettonAddress = jetton.jetton.address;
            const isVerified = jetton.jetton.verification === "whitelist";
            const verifiedBadge = isVerified
                ? '<img src="https://upload.wikimedia.org/wikipedia/commons/e/e4/Twitter_Verified_Badge.svg" alt="verified" width="16" class="verified-badge">'
                : '';

            const isSuspicious = !isVerified || image.includes("placeholder");
            const warningIcon = isSuspicious
                ? '<img src="https://cdn-icons-png.flaticon.com/512/1828/1828843.png" alt="warning" width="16" title="Token chưa xác minh hoặc đáng nghi" class="warning-badge">'
                : '';

            const priceUSDT = jetton.price?.prices?.USDT || 0;
            const change24hRaw = jetton.price?.diff_24h?.USDT || null;
            let change24hNumber = null;
            if (change24hRaw) {
                const normalized = change24hRaw.replace(/[−–]/g, '-').replace('%', '');
                change24hNumber = parseFloat(normalized);
            }
            const changeSign = (change24hNumber !== null && change24hNumber > 0) ? '+' : '';

            const valueInUSDT = balance * priceUSDT;
            const valueInVND = valueInUSDT * usdtToVnd;
            totalJettonValueInUSDT += valueInUSDT;

            const itemHTML = `
                <div class="jetton-item" onclick="fetchJettonInfo('${jettonAddress}')">
                    <div class="jetton-logo-wrapper">
                        <img src="${image}" alt="${name}" class="jetton-logo">
                        <img src="/logo-coin/ton.jpg" alt="TON Network" class="jetton-network-badge">
                    </div>
                    <div class="jetton-info">
                        <strong>${name} ${verifiedBadge} ${warningIcon}</strong>
                        <p>${formattedBalance} ${symbol} ≈ $${valueInUSDT.toLocaleString("en-US", { minimumFractionDigits: 2 })} ≈ ${valueInVND.toLocaleString("vi-VN", { style: 'currency', currency: 'VND' })}</p>
                        <p style="color: ${change24hNumber >= 0 ? 'green' : 'red'};">
                            $${priceUSDT < 0.000001 ? '0' : parseFloat(priceUSDT.toFixed(6)).toString()}
                            (${changeSign}${(change24hNumber ?? 0).toFixed(2)}%)
                        </p>
                    </div>
                    <a href="${EXTERNAL_LINKS.TONVIEWER_JETTON(walletAddress, jettonAddress)}" class="jetton-address-link" target="_blank">View</a>
                </div>
            `;

            if (balance > 0) {
                jettonsList.innerHTML += itemHTML;
            } else {
                zeroBalanceJettonsHTML.push(itemHTML);
            }
        }

        // Tổng giá trị tài sản
        const allValueInUSDT = tonValueInUSDT + totalJettonValueInUSDT;
        const allValueInVND = allValueInUSDT * usdtToVnd;

        const totalAssetHTML = `
            <div class="jetton-item total-asset">
                <div class="jetton-info">
                    <strong>Tổng số dư</strong>
                    <div id="friendly-address-wrapper">
                        <span id="friendly-address">Đang tải địa chỉ...</span>
                        <i id="copy-friendly-icon" class="fas fa-copy"></i>
                    </div>
                    <p>
                        ≈ $${allValueInUSDT.toLocaleString("en-US", { minimumFractionDigits: 2 })} ≈ 
                        ${allValueInVND.toLocaleString("vi-VN", { style: 'currency', currency: 'VND' })}
                    </p>
                </div>
            </div>
        `;
        jettonsList.innerHTML = totalAssetHTML + jettonsList.innerHTML;

        if (zeroBalanceJettonsHTML.length > 0) {
            seeAllBtn.style.display = 'block';
            let expanded = false; // trạng thái xem danh sách đã mở chưa

            seeAllBtn.onclick = () => {
                tg.HapticFeedback.impactOccurred('light');
                if (!expanded) {
                    zeroBalanceList.innerHTML = zeroBalanceJettonsHTML.join('');
                    zeroBalanceList.style.display = 'block';
                    seeAllBtn.textContent = '------- Thu gọn -------';
                } else {
                    zeroBalanceList.style.display = 'none';
                    seeAllBtn.textContent = '------- Xem tất cả -------';
                }
                expanded = !expanded;
            };
        }

        // Cập nhật danh sách Jetton cho tính năng gửi
        populateJettonSelectionList();

    } catch (error) {
        loadingSpinner.style.display = 'none';
        console.error('ERROR fetching jettons:', error);
        displayToast('error', `<strong>Lỗi khi tải Jetton:</strong> ${error.message || 'Không xác định'}`);
    }
}

// --- Hàm hiển thị popup thông tin Jetton chi tiết ---
async function fetchJettonInfo(jettonAddress) {
    tg.HapticFeedback.impactOccurred('light');
    jettonInfoPopup.style.display = 'block';

    jettonInfoContainer.innerHTML = `
        <div class="spinner"></div>
        <p style="text-align: center; margin-top: 10px;">Đang tải thông tin...</p>
    `;
    await delay(500); // Giả lập độ trễ tải để spinner hiện rõ hơn

    try {
        let jettonData;
        for (let i = 0; i < APP_CONFIG.MAX_API_RETRIES; i++) {
            try {
                const response = await fetch(`https://tonapi.io/v2/jettons/${jettonAddress}`);
                jettonData = await response.json();
                if (jettonData) break;
            } catch (error) {
                console.error(`Attempt ${i + 1} failed to fetch jetton info:`, error);
                if (i < APP_CONFIG.MAX_API_RETRIES - 1) {
                    await delay(APP_CONFIG.API_RETRY_DELAY);
                } else {
                    throw new Error("Failed to fetch jetton info after multiple retries.");
                }
            }
        }


        if (jettonData) {
            const name = jettonData.metadata?.name || 'Không có';
            const symbol = jettonData.metadata?.symbol || 'Không có';
            const description = jettonData.metadata?.description || 'Không có mô tả';
            const verification = jettonData.verification === 'whitelist'
                ? `<span style="color: #1877F2; font-weight: bold;">
                      Verified
                      <img src="https://upload.wikimedia.org/wikipedia/commons/e/e4/Twitter_Verified_Badge.svg" 
                           alt="verified" width="16" style="vertical-align: middle; margin-bottom: 3px;">
                    </span>`
                : `<span style="color: red; font-weight: bold;">
                    Not verified
                      <img src="https://cdn-icons-png.flaticon.com/512/1828/1828843.png" 
                           alt="warning" width="16" style="vertical-align: middle;  margin-bottom: 3px;">
                    </span>`;

            const decimals = Number(jettonData.metadata?.decimals || 0);
            const holders = Number(jettonData.holders_count).toLocaleString();
            const rawSupply = BigInt(jettonData.total_supply);
            const supply = Number(rawSupply / BigInt(10 ** decimals)).toLocaleString();

            let imageUrl = jettonData.metadata?.image || '/logo-coin/loi.png';
            if (imageUrl.startsWith('ipfs://')) {
                imageUrl = imageUrl.replace('ipfs://', 'https://cloudflare-ipfs.com/ipfs/');
            }

            const websites = jettonData.metadata?.websites || [];
            let websitesHTML = '';
            if (websites.length > 0) {
                websitesHTML = `<p><strong>Website:</strong></p><ul>` +
                    websites.map(url => `<li><a href="${url}" target="_blank">${url}</a></li>`).join('') +
                    `</ul>`;
            }

            const socials = jettonData.metadata?.social || [];
            let socialsHTML = '';
            if (socials.length > 0) {
                socialsHTML = `<p><strong>Mạng xã hội:</strong></p><ul>` +
                    socials.map(link => `<li><a href="${link}" target="_blank">${link}</a></li>`).join('') +
                    `</ul>`;
            }

            const jettonHTML = `
                <img src="${imageUrl}" alt="${name}" style="width: 80px; height: 80px; border-radius: 10px; margin-bottom: 10px;">
                <p><strong>Tên:</strong> ${name}</p>
                <p><strong>Ký hiệu:</strong> ${symbol}</p>
                <p><strong>Địa chỉ:</strong> <a href="${EXTERNAL_LINKS.TONVIEWER_JETTON(currentConnectedWalletAddressRaw, jettonAddress)}" target="_blank">${truncateAddress(jettonAddress)}</a></p>
                <p><strong>Mô tả:</strong> ${description}</p>
                <p><strong>Số người nắm giữ:</strong> ${holders}</p>
                <p><strong>Tổng cung:</strong> ${supply}</p>
                <p><strong>Trạng thái:</strong> ${verification}</p>
                ${websitesHTML}
                ${socialsHTML}
            `;
            jettonInfoContainer.innerHTML = jettonHTML;
        } else {
            jettonInfoContainer.innerHTML = '<p style="text-align: center; color: red;">Không tìm thấy thông tin Jetton.</p>';
        }
    } catch (error) {
        jettonInfoContainer.innerHTML = '<p style="text-align: center; color: red;">Lỗi khi tải thông tin Jetton.</p>';
        console.error('ERROR fetching jetton info:', error);
    }
}

// Đóng popup thông tin Jetton
jettonInfoCloseBtn.onclick = () => {
    tg.HapticFeedback.impactOccurred('light');
    jettonInfoPopup.style.display = 'none';
};

// --- Popup lịch sử giao dịch chi tiết (mới) ---
function openTransactionDetailPopup(transaction) {
    tg.HapticFeedback.impactOccurred('light');
    txDetailPopup.style.display = 'block';
    txDetailContent.innerHTML = `
        <h4>Chi tiết giao dịch</h4>
        <p><strong>Hash:</strong> ${truncateAddress(transaction.hash)}</p>
        <p><strong>Loại:</strong> ${transaction.is_scam ? '<span style="color:red;">SCAM</span>' : transaction.tx_type}</p>
        <p><strong>Giá trị:</strong> ${formatNumberVietnamese(transaction.value / 1e9)} TON</p>
        <p><strong>Phí:</strong> ${formatNumberVietnamese(transaction.fee / 1e9)} TON</p>
        <p><strong>Thời gian:</strong> ${new Date(transaction.utime * 1000).toLocaleString()}</p>
        <p><strong>Gửi từ:</strong> ${truncateAddress(transaction.src)}</p>
        <p><strong>Gửi đến:</strong> ${truncateAddress(transaction.dest)}</p>
        <p><a href="${EXTERNAL_LINKS.TONVIEWER_TRANSACTION(transaction.hash)}" target="_blank">Xem trên Tonviewer</a></p>
        ${transaction.comment ? `<p><strong>Comment:</strong> ${transaction.comment}</p>` : ''}
        ${transaction.jetton_info ? `
            <p><strong>Jetton:</strong> ${transaction.jetton_info.name || transaction.jetton_info.symbol}</p>
            <p><strong>Số lượng Jetton:</strong> ${formatNumberVietnamese(transaction.jetton_info.amount / (10**transaction.jetton_info.decimals))} ${transaction.jetton_info.symbol}</p>
            <p><a href="${EXTERNAL_LINKS.TONVIEWER_JETTON(currentConnectedWalletAddressRaw, transaction.jetton_info.address)}" target="_blank">Xem Jetton trên Tonviewer</a></p>
        ` : ''}
    `;
}

// Đóng popup chi tiết giao dịch
if (txDetailCloseBtn) {
    txDetailCloseBtn.onclick = () => {
        tg.HapticFeedback.impactOccurred('light');
        txDetailPopup.style.display = 'none';
    };
}


// --- Hàm tải và hiển thị tất cả giao dịch (đã nâng cấp) ---
const transactionsList = document.getElementById('transactions-list');
let lastTransactionLt = null; // Để phân trang
let isLoadingTransactions = false;

async function fetchAndDisplayAllTransactions(walletAddress) {
    if (isLoadingTransactions) return; // Tránh gọi API liên tục
    isLoadingTransactions = true;
    transactionsList.innerHTML = '<div class="spinner"></div><p style="text-align: center; margin-top: 10px;">Đang tải giao dịch...</p>';

    try {
        let transactionsData;
        for (let i = 0; i < APP_CONFIG.MAX_API_RETRIES; i++) {
            try {
                const url = `https://tonapi.io/v2/accounts/${walletAddress}/transactions?limit=100`; // Lấy nhiều hơn
                const response = await fetch(url);
                transactionsData = await response.json();
                if (transactionsData) break;
            } catch (error) {
                console.error(`Attempt ${i + 1} failed to fetch transactions:`, error);
                if (i < APP_CONFIG.MAX_API_RETRIES - 1) {
                    await delay(APP_CONFIG.API_RETRY_DELAY);
                } else {
                    throw new Error("Failed to fetch transactions after multiple retries.");
                }
            }
        }

        transactionsList.innerHTML = ''; // Clear loading spinner
        if (!transactionsData.transactions || transactionsData.transactions.length === 0) {
            transactionsList.innerHTML = '<p class="text-center">Chưa có giao dịch nào.</p>';
            return;
        }

        transactionsData.transactions.forEach(tx => {
            let type = 'Unknown';
            let amountDisplay = '';
            let isIncoming = false;
            let iconClass = '';
            let comment = '';
            let jettonInfo = null;

            // Kiểm tra comment
            if (tx.in_msg?.message) {
                comment = tx.in_msg.message;
            } else if (tx.out_msgs && tx.out_msgs.length > 0 && tx.out_msgs[0].message) {
                comment = tx.out_msgs[0].message;
            }

            // Xử lý Jetton Transfer
            if (tx.in_msg && tx.in_msg.message_content?.boc && tx.in_msg.source) {
                try {
                    const cell = window.ton_core.Cell.fromBase64(tx.in_msg.message_content.boc);
                    const slice = cell.beginParse();
                    const opCode = slice.readUint(32);

                    if (opCode.eq(BigInt(0x7362d09c))) { // op::jetton::transfer
                        const queryId = slice.readUint(64);
                        const amount = slice.readCoins();
                        const destinationAddress = slice.readAddress();
                        const responseAddress = slice.readAddress();
                        const customPayload = slice.readBit(); // bool: has custom payload
                        const forwardTonAmount = slice.readCoins();
                        const forwardPayload = slice.readBit(); // bool: has forward payload

                        type = "Jetton Transfer";
                        isIncoming = walletAddress === tx.in_msg.destination; // Là incoming nếu đích là ví mình
                        
                        // Cần tìm jetton metadata từ tonapi hoặc từ allLoadedJettons
                        const foundJetton = allLoadedJettons.find(j => j.jettonAddressRaw === tx.in_msg.source);
                        if (foundJetton) {
                            jettonInfo = {
                                name: foundJetton.jetton.name,
                                symbol: foundJetton.jetton.symbol,
                                decimals: foundJetton.jetton.decimals,
                                amount: Number(amount),
                                address: foundJetton.jetton.address
                            };
                            amountDisplay = `${formatNumberVietnamese(Number(amount) / (10 ** (foundJetton.jetton.decimals || APP_CONFIG.JETTON_DEFAULT_DECIMALS)))} ${foundJetton.jetton.symbol}`;
                            iconClass = isIncoming ? 'fa-arrow-down-long received-icon' : 'fa-arrow-up-long sent-icon';
                        } else {
                             // Fallback nếu không tìm thấy jetton info
                            amountDisplay = `${formatNumberVietnamese(Number(amount))} raw units`;
                            iconClass = 'fa-arrow-right-arrow-left unknown-icon';
                        }
                    }
                } catch (e) {
                    console.warn("Could not parse Jetton Transfer payload:", e);
                    // Fallback to TON transaction if parsing fails
                }
            }
            
            // Xử lý TON transaction nếu không phải Jetton hoặc Jetton parsing thất bại
            if (!jettonInfo) {
                if (tx.out_msgs && tx.out_msgs.length > 0 && tx.out_msgs[0].destination) {
                    // Outgoing TON
                    type = "Outgoing TON";
                    amountDisplay = `${formatNumberVietnamese(tx.out_msgs[0].value / 1e9)} TON`;
                    iconClass = 'fa-arrow-up-long sent-icon';
                } else if (tx.in_msg && tx.in_msg.source && tx.in_msg.value) {
                    // Incoming TON
                    type = "Incoming TON";
                    amountDisplay = `${formatNumberVietnamese(tx.in_msg.value / 1e9)} TON`;
                    iconClass = 'fa-arrow-down-long received-icon';
                    isIncoming = true;
                } else {
                    type = "Internal Transaction";
                    amountDisplay = `${formatNumberVietnamese(tx.total_fees / 1e9)} TON (Fees)`; // Hoặc xử lý kỹ hơn nếu cần
                    iconClass = 'fa-arrow-right-arrow-left unknown-icon';
                }
            }


            const txItem = document.createElement('div');
            txItem.classList.add('transaction-item');
            txItem.innerHTML = `
                <div class="transaction-icon">
                    <i class="fa-solid ${iconClass}"></i>
                </div>
                <div class="transaction-details">
                    <div class="transaction-header">
                        <span class="transaction-type">${type}</span>
                        <span class="transaction-amount ${isIncoming ? 'incoming' : 'outgoing'}">${isIncoming ? '+' : '-'}${amountDisplay}</span>
                    </div>
                    <div class="transaction-meta">
                        <span class="transaction-time">${new Date(tx.utime * 1000).toLocaleString()}</span>
                        <span class="transaction-address">
                            ${isIncoming ? `From: ${truncateAddress(tx.in_msg?.source || 'Unknown')}` : `To: ${truncateAddress(tx.out_msgs[0]?.destination || 'Unknown')}`}
                        </span>
                    </div>
                    ${comment ? `<p class="transaction-comment">Comment: ${comment}</p>` : ''}
                </div>
            `;
            txItem.onclick = () => openTransactionDetailPopup({
                hash: tx.hash,
                tx_type: type,
                value: tx.in_msg?.value || tx.out_msgs?.[0]?.value || 0,
                fee: tx.fee,
                utime: tx.utime,
                src: tx.in_msg?.source || 'N/A',
                dest: tx.out_msgs?.[0]?.destination || 'N/A',
                comment: comment,
                is_scam: tx.is_scam,
                jetton_info: jettonInfo
            });
            transactionsList.appendChild(txItem);
        });

        // Cập nhật lastTransactionLt cho lần tải tiếp theo
        if (transactionsData.transactions.length > 0) {
            lastTransactionLt = transactionsData.transactions[transactionsData.transactions.length - 1].lt;
        }

    } catch (error) {
        transactionsList.innerHTML = '<p class="text-center text-danger">Lỗi khi tải lịch sử giao dịch.</p>';
        console.error('ERROR fetching transactions:', error);
    } finally {
        isLoadingTransactions = false;
    }
}


// --- Logic chọn Jetton để gửi ---
if (selectJettonBtn) {
    selectJettonBtn.onclick = () => {
        tg.HapticFeedback.impactOccurred('light');
        const jettonSelectionPopup = Swal.fire({
            title: 'Chọn Jetton để gửi',
            html: `
                <div class="jetton-selection-list" id="jetton-list-for-selection">
                    ${allLoadedJettons.map(jetton => {
                        const decimals = jetton.jetton.decimals || APP_CONFIG.JETTON_DEFAULT_DECIMALS;
                        const balance = parseFloat(jetton.balance) / (10 ** decimals);
                        const image = jetton.jetton.image || '/logo-coin/loi.png';
                        return `
                            <div class="jetton-selection-item" data-jetton-address="${jetton.jettonAddressRaw}" data-jetton-balance="${balance}">
                                <img src="${image}" alt="${jetton.jetton.name}" class="jetton-logo">
                                <span>${jetton.jetton.name || 'Unknown'} (${jetton.jetton.symbol || '???'})</span>
                                <span class="balance">${formatNumberVietnamese(balance)}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            `,
            showConfirmButton: false,
            showCancelButton: true,
            cancelButtonText: 'Hủy bỏ',
            customClass: { popup: 'swal-popup-custom' },
            didOpen: () => {
                document.querySelectorAll('.jetton-selection-item').forEach(item => {
                    item.onclick = () => {
                        tg.HapticFeedback.impactOccurred('light');
                        const selectedAddr = item.getAttribute('data-jetton-address');
                        selectedJettonForSend = allLoadedJettons.find(j => j.jettonAddressRaw === selectedAddr);
                        if (selectedJettonForSend) {
                            selectedJettonDisplay.textContent = `${selectedJettonForSend.jetton.name} (${selectedJettonForSend.jetton.symbol})`;
                            const currentJettonBalance = parseFloat(selectedJettonForSend.balance) / (10 ** (selectedJettonForSend.jetton.decimals || APP_CONFIG.JETTON_DEFAULT_DECIMALS));
                            jettonAmountInput.setAttribute("max", currentJettonBalance);
                            maxJettonBtn.onclick = () => {
                                tg.HapticFeedback.impactOccurred('light');
                                jettonAmountInput.value = currentJettonBalance;
                            };
                            jettonSelectionPopup.close(); // Đóng popup chọn Jetton
                        }
                    };
                });
            }
        });
    };
}


// --- Logic chuyển đổi giữa gửi TON và gửi Jetton ---
if (sendTypeToggle) {
    sendTypeToggle.onchange = (event) => {
        tg.HapticFeedback.impactOccurred('light');
        if (event.target.value === 'ton') {
            tonSendSection.style.display = 'block';
            jettonSendSection.style.display = 'none';
        } else {
            tonSendSection.style.display = 'none';
            jettonSendSection.style.display = 'block';
            // Reset jetton selection when switching to jetton tab
            selectedJettonDisplay.textContent = 'Chọn Jetton';
            selectedJettonForSend = null;
            jettonAmountInput.value = '';
            jettonAmountInput.setAttribute("max", "0");
        }
    };
}

// --- Hàm reset UI khi ngắt kết nối ---
function resetWalletUI() {
    connectOnlyDiv.style.display = 'flex';
    disconnectButton.style.display = 'none';
    tokenHeader.style.display = 'none';
    seeAllBtn.style.display = 'none';
    jettonsList.innerHTML = '';
    zeroBalanceList.innerHTML = '';
    transactionsList.innerHTML = '';
    friendlyAddressSpan.textContent = "Chưa kết nối ví";
    copyFriendlyIcon.style.display = 'none';
    walletBalanceEl.textContent = 'Balance: 0 TON';
    toAddressInput.value = '';
    tonAmountInput.value = '';
    jettonAmountInput.value = '';
    memoTextInput.value = '';
    lastTransactionLt = null;
    isLoadingTransactions = false;
    currentConnectedWalletAddressRaw = null;
    allLoadedJettons = [];
    selectedJettonForSend = null;
    selectedJettonDisplay.textContent = 'Chọn Jetton';
    jettonAmountInput.setAttribute("max", "0");

    // Đảm bảo chỉ hiển thị section gửi TON khi chưa kết nối
    tonSendSection.style.display = 'block';
    jettonSendSection.style.display = 'none';
    if (sendTypeToggle) sendTypeToggle.value = 'ton'; // Đặt lại toggle về TON
}


// --- Xử lý thay đổi trạng thái kết nối ví ---
connector.onStatusChange(async (wallet) => {
    if (wallet && wallet.account) {
        connectOnlyDiv.style.display = 'none';
        disconnectButton.style.display = 'block';
        tokenHeader.style.display = 'block';
        seeAllBtn.style.display = 'block';

        // Gọi các hàm cập nhật thông tin ví và jetton
        await updateWalletInfo(wallet.account.address);
        await fetchJettons(wallet.account.address);

        disconnectButton.onclick = async () => {
            tg.HapticFeedback.impactOccurred('light');
            await connector.disconnect();
            resetWalletUI();
            displayToast('info', '<strong>Đã ngắt kết nối ví.</strong>');
        };
    } else {
        // Nếu không có ví nào được kết nối
        resetWalletUI();
    }
});


// Tự động active tab đang mở (đoạn code gốc)
const currentPage = location.pathname.split("/").pop();
const items = document.querySelectorAll(".footer-item");
items.forEach(item => {
    const page = item.getAttribute("data-page");
    if (page === currentPage) {
        item.classList.add("active");
    }
});

// Chắc chắn rằng hàm populateJettonSelectionList được định nghĩa sau khi allLoadedJettons có dữ liệu
function populateJettonSelectionList() {
    if (!jettonListForSelection) return; // Kiểm tra xem phần tử có tồn tại không

    jettonListForSelection.innerHTML = allLoadedJettons.map(jetton => {
        const decimals = jetton.jetton.decimals || APP_CONFIG.JETTON_DEFAULT_DECIMALS;
        const balance = parseFloat(jetton.balance) / (10 ** decimals);
        let image = jetton.jetton.image || '/logo-coin/loi.png';
        if (image.startsWith('ipfs://')) {
            image = image.replace('ipfs://', 'https://cloudflare-ipfs.com/ipfs/');
        }
        return `
            <div class="jetton-selection-item" data-jetton-address="${jetton.jettonAddressRaw}">
                <img src="${image}" alt="${jetton.jetton.name}" class="jetton-logo-small">
                <span>${jetton.jetton.name || 'Unknown'} (${jetton.jetton.symbol || '???'})</span>
                <span class="balance">${formatNumberVietnamese(balance)}</span>
            </div>
        `;
    }).join('');

    document.querySelectorAll('.jetton-selection-item').forEach(item => {
        item.onclick = () => {
            tg.HapticFeedback.impactOccurred('light');
            const selectedAddr = item.getAttribute('data-jetton-address');
            selectedJettonForSend = allLoadedJettons.find(j => j.jettonAddressRaw === selectedAddr);
            if (selectedJettonForSend) {
                selectedJettonDisplay.textContent = `${selectedJettonForSend.jetton.name} (${selectedJettonForSend.jetton.symbol})`;
                const currentJettonBalance = parseFloat(selectedJettonForSend.balance) / (10 ** (selectedJettonForSend.jetton.decimals || APP_CONFIG.JETTON_DEFAULT_DECIMALS));
                jettonAmountInput.setAttribute("max", currentJettonBalance);
                maxJettonBtn.onclick = () => {
                    tg.HapticFeedback.impactOccurred('light');
                    jettonAmountInput.value = currentJettonBalance;
                };
                Swal.close(); // Đóng popup chọn Jetton
            }
        };
    });
}