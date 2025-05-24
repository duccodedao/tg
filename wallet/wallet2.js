
// Global Constants ---
const APP_CONFIG = {
    MANIFEST_URL: "https://bmweb.site/tonconnect-manifest.json",
    QR_CODE_WIDTH: 300,
    COPY_MESSAGE_DURATION: 2000,
    SWAL_TOAST_DURATION: 3000,
    JETTON_DEFAULT_DECIMALS: 9,
    API_RETRY_COUNT: 3, // Số lần thử lại API
    API_RETRY_DELAY_MS: 2000 // Thời gian chờ giữa các lần thử lại (ms)
};

const API_ENDPOINTS = {
    TONCENTER_GET_ADDRESS_INFO: 'https://toncenter.com/api/v2/getExtendedAddressInformation',
    TONAPI_GET_ACCOUNT: (address) => `https://tonapi.io/v2/accounts/${address}`, // TonAPI for account info
    TONAPI_GET_EVENTS: (address) => `https://tonapi.io/v2/accounts/${address}/events?initiator=false&subject_only=false&limit=100`,
    TONCENTER_DETECT_ADDRESS: 'https://toncenter.com/api/v2/detectAddress'
};

const EXTERNAL_LINKS = {
    TONVIEWER_TRANSACTION: (hash) => `https://tonviewer.com/transaction/${hash}`
};

// --- DOM Element Caching ---
const qrBtn = document.getElementById('show-qr-btn');
const qrModal = document.getElementById('qr-modal');
const closeQr = document.getElementById('close-qr');
const qrCanvas = document.getElementById('qr-canvas');
const qrAddressDisplay = document.getElementById('qr-address');
const copyBtn = document.getElementById('copy-btn');
const walletAddressEl = document.getElementById("wallet-address");
const walletBalanceEl = document.getElementById("wallet-balance");
const tonAmountInput = document.getElementById("ton-amount");
const connectOnlySection = document.getElementById("connect-only");
const mainContentSection = document.getElementById("main-content");
const disconnectBtn = document.getElementById("disconnect");
const transactionsList = document.getElementById("transactions-list");
const sendTonBtn = document.getElementById("send-ton-btn");
const toAddressInput = document.getElementById("to-address");
const memoTextInput = document.getElementById("memo-text");
// const maxTonBtn = document.getElementById("max-ton-btn"); // Đã xóa/chú thích theo yêu cầu trước

// --- Global Variables ---
let balanceTon = 0;
let connector;
const addressCache = {}; // Cache cho các địa chỉ đã chuyển đổi Base64url
let allLoadedTransactions = []; // Lưu trữ tất cả giao dịch sau khi tải
let currentlyDisplayedTransactions = 0; // Đếm số lượng giao dịch đã hiển thị

// --- Utility Functions ---

/**
 * Delays execution for a given number of milliseconds.
 * @param {number} ms The delay time in milliseconds.
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Converts a raw TON address to its Base64url friendly form.
 * Uses cache to avoid repeated API calls.
 * @param {string} rawAddress The raw TON address (e.g., "0:...")
 * @returns {Promise<string>} The Base64url address or the original raw address if conversion fails.
 */
async function convertRawAddressToB64url(rawAddress) {
    if (!rawAddress || rawAddress === "Unknown") return rawAddress;

    // Kiểm tra trong cache trước
    if (addressCache[rawAddress]) {
        return addressCache[rawAddress];
    }

    for (let i = 0; i < APP_CONFIG.API_RETRY_COUNT; i++) {
        try {
            const response = await fetch(`${API_ENDPOINTS.TONCENTER_DETECT_ADDRESS}?address=${rawAddress}`);
            if (!response.ok) {
                if (response.status === 429 && i < APP_CONFIG.API_RETRY_COUNT - 1) {
                    console.warn(`Rate limit hit for detectAddress, retrying in ${APP_CONFIG.API_RETRY_DELAY_MS / 1000}s...`);
                    await delay(APP_CONFIG.API_RETRY_DELAY_MS);
                    continue;
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();

            if (data.ok && data.result && data.result.bounceable && data.result.bounceable.b64url) {
                const b64urlAddress = data.result.bounceable.b64url;
                addressCache[rawAddress] = b64urlAddress; // Lưu vào cache
                return b64urlAddress;
            } else {
                console.warn("Failed to convert address to b64url:", rawAddress, data);
                return rawAddress;
            }
        } catch (error) {
            console.error("Error converting raw address to b64url:", error);
            if (i < APP_CONFIG.API_RETRY_COUNT - 1) {
                await delay(APP_CONFIG.API_RETRY_DELAY_MS);
            }
        }
    }
    displayToast('success', '<strong>Tải thành công</strong>');
    return rawAddress; // Trả về địa chỉ raw nếu tất cả các lần thử lại thất bại
}

/**
 * Safely parses nanoTON value to TON.
 * @param {string | number} value NanoTON value.
 * @returns {number} TON value.
 */
function safeParseNanoTON(value) {
    if (typeof value !== 'string' && typeof value !== 'number' || isNaN(value)) {
        return 0;
    }
    return parseFloat(value) / 1e9;
}

/**
 * Formats a number according to Vietnamese standards (dot for thousands, comma for decimals)
 * and removes trailing zeros in the decimal part.
 * Example: 1000.00 -> "1.000"
 * Example: 1000.12300 -> "1.000,123"
 *
 * @param {number} number The number to format.
 * @param {number} decimalPlaces The maximum number of decimal places to consider.
 * @returns {string} The formatted number as a string.
 */
function formatNumberVietnamese(number, decimalPlaces = 9) {
    if (typeof number !== 'number' || isNaN(number)) {
        return '';
    }

    let fixed = number.toFixed(decimalPlaces);
    fixed = fixed.replace(/0+$/, '');
    if (fixed.endsWith('.')) {
        fixed = fixed.slice(0, -1);
    }

    let parts = fixed.split('.');
    let integerPart = parts[0];
    let decimalPart = parts[1];

    integerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

    return decimalPart ? `${integerPart},${decimalPart}` : integerPart;
}

/**
 * Truncates an address for display.
 * @param {string} addr The full address.
 * @param {number} start Number of characters to show at the start.
 * @param {number} end Number of characters to show at the end.
 * @returns {string} The truncated address.
 */
function truncateAddress(addr, start = 8, end = 8) {
    if (!addr || addr.length <= (start + end)) return addr;
    return `${addr.slice(0, start)}...${addr.slice(-end)}`;
}

/**
 * Converts a Base64 string (potentially URL-safe) to a hexadecimal string.
 * @param {string} base64 The Base64 string.
 * @returns {string} The hexadecimal string.
 */
function base64ToHex(base64) {
    const raw = atob(base64.replace(/-/g, '+').replace(/\_/g, '/'));
    let result = '';
    for (let i = 0; i < raw.length; i++) {
        result += raw.charCodeAt(i).toString(16).padStart(2, '0');
    }
    return result;
}

/**
 * Displays a SweetAlert2 toast notification.
 * @param {'success' | 'error' | 'warning' | 'info'} icon The icon type.
 * @param {string} htmlContent The HTML content for the toast.
 */
function displayToast(icon, htmlContent) {
    Swal.fire({
        icon: icon,
        html: htmlContent,
        position: 'top-right',
        toast: true,
        timer: APP_CONFIG.SWAL_TOAST_DURATION,
        showConfirmButton: false,
        padding: '10px',
        customClass: {
            popup: 'swal-popup-custom'
        }
    });
}

/**
 * Toggles the 'expanded' class on a memo element.
 * @param {HTMLElement} el The memo element.
 */
function toggleMemo(el) {
    el.classList.toggle("expanded");
}

// --- Event Handlers ---

async function handleShowQr() {
    const rawAddress = walletAddressEl.getAttribute("data-full-address-raw");
    if (!rawAddress) {
        displayToast('warning', '<strong>Wallet address not available. Please connect your wallet.</strong>');
        return;
    }

    const fullAddressB64url = await convertRawAddressToB64url(rawAddress);
    qrAddressDisplay.innerText = fullAddressB64url;
    QRCode.toCanvas(qrCanvas, fullAddressB64url, { width: APP_CONFIG.QR_CODE_WIDTH }, function(error) {
        if (error) console.error("QR Code generation error:", error);
    });
    qrModal.style.display = 'flex';
}

function handleCloseQr() {
    qrModal.style.display = 'none';
}










document.getElementById("send-ton-btn").addEventListener("click", async () => {
    const toAddress = document.getElementById("to-address").value.trim();
    const amountTON = parseFloat(document.getElementById("ton-amount").value);
    const memo = document.getElementById("memo-text").value.trim();

    const maxAmount = balanceTon; 

    // --- 1. Kiểm tra đầu vào ---
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
            html: `Bạn chỉ có thể gửi tối đa <strong>${formatNumberVietnamese(maxAmount)}</strong> TON.`, 
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

    let toAddressB64url;
    try {
        toAddressB64url = await convertRawAddressToB64url(toAddress);
        if (!toAddressB64url || toAddressB64url === toAddress) {
            console.error("Invalid recipient address format after conversion attempt:", toAddress);
            Swal.fire({
                icon: 'error',
                html: '<strong>Định dạng địa chỉ người nhận không hợp lệ. Vui lòng kiểm tra lại địa chỉ.</strong>',
                position: 'center', // Đã đổi từ 'top-right' sang 'center'
                toast: false,       // Bỏ 'toast: true' hoặc đặt thành 'false'
                timer: 4000,
                showConfirmButton: false,
                padding: '10px',
                customClass: {
                    popup: 'swal-popup-custom'
                }
            });
            return;
        }
    } catch (conversionError) {
        console.error("Error during address conversion:", conversionError);
        Swal.fire({
            icon: 'error',
            html: '<strong>Có lỗi khi xử lý địa chỉ. Vui lòng thử lại.</strong>',
            position: 'center', // Đã đổi từ 'top-right' sang 'center'
            toast: false,       // Bỏ 'toast: true' hoặc đặt thành 'false'
            timer: 4000,
            showConfirmButton: false,
            padding: '10px',
            customClass: {
                popup: 'swal-popup-custom'
            }
        });
        return;
    }

    // --- 2. Hiển thị popup xác nhận giao dịch (sẽ được căn giữa mặc định) ---
    const confirmResult = await Swal.fire({
        title: 'Xác nhận giao dịch',
        html: `Bạn sắp gửi <strong>${formatNumberVietnamese(amountTON)}</strong> TON đến <strong>${truncateAddress(toAddressB64url)}</strong>.${memo ? `<br>Ghi chú: <em>${memo}</em>` : ''}<br><br>Bạn có chắc chắn muốn gửi?`,
        icon: 'info',
        showCancelButton: true,
        confirmButtonText: 'Gửi ngay',
        cancelButtonText: 'Hủy bỏ',
        reverseButtons: true, 
        customClass: {
            popup: 'swal-popup-custom',
        }
    });

    // Nếu người dùng nhấn "Hủy bỏ"
    if (!confirmResult.isConfirmed) {
        Swal.fire({
            icon: 'info',
            html: '<strong>Giao dịch đã bị hủy.</strong>',
            position: 'center', // Đã đổi từ 'top-right' sang 'center'
            toast: false,       // Bỏ 'toast: true' hoặc đặt thành 'false'
            timer: 3000,
            showConfirmButton: false,
            padding: '10px',
            customClass: {
                popup: 'swal-popup-custom'
            }
        });
        return;
    }

    // --- 3. Nếu người dùng nhấn "Gửi ngay", hiển thị popup loading mới (sẽ được căn giữa mặc định) ---
    Swal.fire({
        title: 'Đang gửi giao dịch...',
        html: `
            <div class="swal2-loading-spinner"></div>
            <p>Vui lòng mở ví TON của bạn để xác nhận giao dịch.</p>
            <br>
            <small style="color: #888;">Số lượng: <strong>${formatNumberVietnamese(amountTON)} TON</strong></small><br>
            <small style="color: #888;">Đến: <strong>${truncateAddress(toAddressB64url)}</strong></small>
        `,
        allowOutsideClick: false, 
        allowEscapeKey: false,   
        showConfirmButton: false, 
        customClass: {
            popup: 'swal-popup-custom'
        },
        didOpen: () => {}
    });

    try {
        const amountNanoTON = BigInt(Math.round(amountTON * 1e9)); 

        const tx = {
            validUntil: Math.floor(Date.now() / 1000) + 60,
            messages: [{
                address: toAddressB64url, 
                amount: amountNanoTON.toString(),
                payload: memo ? TON_CONNECT_UI.textToPayload(memo) : undefined
            }]
        };

        const result = await connector.sendTransaction(tx);

        Swal.close(); 

        // --- Thông báo thành công (cũng căn giữa) ---
        Swal.fire({
            icon: 'success',
            title: 'Giao dịch thành công!',
            html: `Bạn đã gửi thành công <strong>${formatNumberVietnamese(amountTON)}</strong> TON<br>đến địa chỉ <strong>${truncateAddress(toAddressB64url)}</strong>.`,
            position: 'center', // Đã đổi từ 'top-right' sang 'center'
            toast: false,       // Bỏ 'toast: true' hoặc đặt thành 'false'
            timer: 5000, 
            showConfirmButton: false,
            padding: '10px',
            customClass: {
                popup: 'swal-popup-custom'
            }
        });

        console.log("Transaction Result:", result);

        if (connector.wallet?.account?.address) {
            await updateWalletInfo(connector.wallet.account.address);
        }

        document.getElementById("to-address").value = '';
        document.getElementById("ton-amount").value = '';
        document.getElementById("memo-text").value = '';

    } catch (err) {
        Swal.close(); 
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

        // --- Thông báo lỗi (cũng căn giữa) ---
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















// --- Data Fetching & UI Update Functions ---

/**
 * Updates wallet balance and fetches all transaction history.
 * @param {string} rawAddress The raw address of the connected wallet.
 */
async function updateWalletInfo(rawAddress) {
    try {
        let accountData;
        for (let i = 0; i < APP_CONFIG.API_RETRY_COUNT; i++) {
            try {
                // Try fetching from TonAPI first for more robust service
                const tonApiRes = await fetch(API_ENDPOINTS.TONAPI_GET_ACCOUNT(rawAddress));
                if (!tonApiRes.ok) {
                    if (tonApiRes.status === 429 && i < APP_CONFIG.API_RETRY_COUNT - 1) {
                        console.warn(`Rate limit hit for TonAPI account info, retrying in ${APP_CONFIG.API_RETRY_DELAY_MS / 1000}s...`);
                        await delay(APP_CONFIG.API_RETRY_DELAY_MS);
                        continue;
                    }
                    // Fallback to Toncenter if TonAPI fails or is not found
                    console.warn(`TonAPI account info failed (${tonApiRes.status}), trying Toncenter...`);
                    const toncenterRes = await fetch(`${API_ENDPOINTS.TONCENTER_GET_ADDRESS_INFO}?address=${rawAddress}`);
                    if (!toncenterRes.ok) {
                        if (toncenterRes.status === 429 && i < APP_CONFIG.API_RETRY_COUNT - 1) {
                            console.warn(`Rate limit hit for Toncenter address info, retrying in ${APP_CONFIG.API_RETRY_DELAY_MS / 1000}s...`);
                            await delay(APP_CONFIG.API_RETRY_DELAY_MS);
                            continue;
                        }
                        throw new Error(`HTTP error! status: ${toncenterRes.status}`);
                    }
                    const toncenterData = await toncenterRes.json();
                    if (toncenterData.ok && toncenterData.result) {
                        // Map Toncenter response to a similar structure as TonAPI for consistency
                        accountData = {
                            address: toncenterData.result.address.account_address,
                            balance: toncenterData.result.balance,
                            // Add other fields if needed for display that Toncenter provides
                        };
                        break; // Successfully fetched from Toncenter
                    } else {
                        throw new Error("Invalid response from Toncenter API.");
                    }
                } else {
                    accountData = await tonApiRes.json();
                    break; // Successfully fetched from TonAPI
                }
            } catch (innerError) {
                console.error(`Attempt ${i + 1} to fetch account info failed:`, innerError);
                if (i < APP_CONFIG.API_RETRY_COUNT - 1) {
                    await delay(APP_CONFIG.API_RETRY_DELAY_MS);
                } else {
                    throw innerError; // Re-throw if all retries fail
                }
            }
        }

        if (!accountData) {
            throw new Error("Failed to fetch account data after multiple retries.");
        }

        const accountAddressRaw = accountData.address;
        const balanceNanoTON = parseInt(accountData.balance);
        balanceTon = safeParseNanoTON(balanceNanoTON);

        walletBalanceEl.textContent = `Balance: ${formatNumberVietnamese(balanceTon)} TON`;
        tonAmountInput.setAttribute("max", balanceTon);

        const accountAddressB64url = await convertRawAddressToB64url(accountAddressRaw);
        const shortAddressB64url = truncateAddress(accountAddressB64url);

        walletAddressEl.textContent = shortAddressB64url;
        walletAddressEl.setAttribute("data-full-address-raw", accountAddressRaw);
        walletAddressEl.setAttribute("data-full-address-b64url", accountAddressB64url);

        disconnectBtn.style.display = 'inline-block';
        connectOnlySection.style.display = "none";
        mainContentSection.style.display = "block";

        // Fetch and display ONLY Jetton transactions
        await fetchAndDisplayAllTransactions(accountAddressRaw);
    } catch (err) {
        console.error("Error fetching TON information:", err);
        displayToast('error', '<strong>Failed to load wallet balance and information. Please try connecting again.</strong>');
        resetWalletUI();
    }
}

/**
 * Fetches events from TonAPI, including Jetton transfers.
 * @param {string} walletAddressRaw The raw address of the wallet.
 * @returns {Promise<Array<Object>>} An array of event objects.
 */
async function fetchAccountEvents(walletAddressRaw) {
    for (let i = 0; i < APP_CONFIG.API_RETRY_COUNT; i++) {
        try {
            const response = await fetch(API_ENDPOINTS.TONAPI_GET_EVENTS(walletAddressRaw));
            if (!response.ok) {
                if (response.status === 429 && i < APP_CONFIG.API_RETRY_COUNT - 1) {
                    console.warn(`Rate limit hit for TonAPI events, retrying in ${APP_CONFIG.API_RETRY_DELAY_MS / 1000}s...`);
                    await delay(APP_CONFIG.API_RETRY_DELAY_MS);
                    continue;
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            return data.events || [];
        } catch (error) {
            console.error(`Attempt ${i + 1} to fetch account events failed:`, error);
            if (i < APP_CONFIG.API_RETRY_COUNT - 1) {
                await delay(APP_CONFIG.API_RETRY_DELAY_MS);
            } else {
                displayToast('error', '<strong>Failed to load transaction history after multiple retries.</strong>');
                return []; // Return empty array if all retries fail
            }
        }
    }
    return []; // Should not be reached, but for safety
}

/**
 * Renders a batch of transactions to the DOM.
 * @param {Array<Object>} transactions The array of transaction objects.
 * @param {number} startIndex The starting index for rendering.
 * @param {number} count The number of transactions to render in this batch.
 */
function renderTransactionsBatch(transactions, startIndex, count) {
    const endIndex = Math.min(startIndex + count, transactions.length);
    for (let i = startIndex; i < endIndex; i++) {
        const tx = transactions[i];
        const time = new Date(tx.utime * 1000).toLocaleString();
        const txLink = EXTERNAL_LINKS.TONVIEWER_TRANSACTION(tx.txHashRaw);
        let labelText = '';
        let amountColor = 'var(--text-color)';
        let iconPath = tx.jettonImage;
        let amountDisplay = '';
        let popupHandler = '';

        if (tx.isReceived) {
            amountColor = "green";
            amountDisplay = `+ ${formatNumberVietnamese(tx.amountJetton, 4)} ${tx.jettonSymbol}`;
        } else if (tx.isSent) {
            amountColor = "red";
            amountDisplay = `- ${formatNumberVietnamese(tx.amountJetton, 4)} ${tx.jettonSymbol}`;
        } else {
            amountColor = 'var(--text-color)';
            amountDisplay = `${formatNumberVietnamese(tx.amountJetton, 4)} ${tx.jettonSymbol}`;
        }
        
        // Cần đảm bảo JSON.stringify hoạt động chính xác và không gây lỗi cú pháp HTML
        // Đây là điểm có thể gây lỗi nếu chuỗi JSON quá phức tạp hoặc có chứa ký tự đặc biệt
        // Cách tốt nhất là truyền dữ liệu qua DOM thay vì trực tiếp vào onclick
        // Hoặc đơn giản hóa dữ liệu truyền vào
        // Đối với mục đích hiện tại, cách bạn đã làm sẽ hoạt động với các chuỗi đơn giản
        // popupHandler = `openJettonTransactionPopup(${JSON.stringify(tx).replace(/"/g, "'").replace(/'/g, "\\'")}, '${walletAddressEl.getAttribute("data-full-address-raw")}')`;
        
        // Improved way to handle onclick event data (less prone to HTML parsing issues)
        // Store the transaction data in a global array or map and pass an index
        const txIndex = allLoadedTransactions.indexOf(tx); // Find the index of this transaction
        popupHandler = `openJettonTransactionPopup(${txIndex}, '${walletAddressEl.getAttribute("data-full-address-raw")}')`;


        labelText = `${tx.jettonName || tx.jettonSymbol} Transfer`;

        const li = document.createElement("li");
        li.className = "transaction-item";
        li.innerHTML = `
        <div class="row">
            <div class="icon-label">
                <span class="icon"><img src="${iconPath}" alt="${tx.jettonSymbol}"></span>
                <span>${labelText}</span>
            </div>
            <div class="amount" style="color: ${amountColor};">${amountDisplay}</div>
        </div>
        <div class="row justify-between">
            <div class="address" title="${tx.txHashRaw}">
                <a href="${txLink}" target="_blank">🔎 Tonviewer</a>
            </div>
            <div class="time">${time}</div>
        </div>
        <div class="row justify-between">
            <div class="memo" onclick="toggleMemo(this)">${tx.memo}</div>
        </div>
        `;
        li.setAttribute('onclick', popupHandler);
        transactionsList.appendChild(li);
    }
    currentlyDisplayedTransactions = endIndex;
}


/**
 * Fetches Jetton transactions (via events) and displays them.
 * @param {string} walletAddressRaw The raw address of the wallet.
 */
async function fetchAndDisplayAllTransactions(walletAddressRaw) {
    transactionsList.innerHTML = `
        <div class="loading-spinner">
            <div class="spinner"></div>
            <div>Loading transactions...</div>
        </div>
    `;

    const events = await fetchAccountEvents(walletAddressRaw);

    allLoadedTransactions = []; // Reset list khi tải lại
    currentlyDisplayedTransactions = 0; // Reset counter khi tải lại
    const currentWalletB64url = await convertRawAddressToB64url(walletAddressRaw); // Địa chỉ ví hiện tại (sẽ dùng cache)

    // Bước 1: Thu thập tất cả các địa chỉ raw duy nhất cần chuyển đổi
    const addressesToConvert = new Set();
    addressesToConvert.add(walletAddressRaw); // Địa chỉ ví hiện tại
    for (const event of events) {
        for (const action of event.actions) {
            if (action.type === "JettonTransfer" && action.JettonTransfer) {
                const jt = action.JettonTransfer;
                addressesToConvert.add(jt.sender.address);
                addressesToConvert.add(jt.recipient.address);
                addressesToConvert.add(jt.jetton.address);
            }
        }
    }

    // Bước 2: Chuyển đổi tất cả các địa chỉ duy nhất và lưu vào cache
    await Promise.all(Array.from(addressesToConvert).map(addr => convertRawAddressToB64url(addr)));

    // Bước 3: Xử lý các giao dịch sử dụng địa chỉ đã được cache
    for (const event of events) {
        for (const action of event.actions) {
            if (action.type === "JettonTransfer" && action.JettonTransfer) {
                const jt = action.JettonTransfer;

                const sourceAddressRaw = jt.sender.address;
                const destinationAddressRaw = jt.recipient.address;
                const jettonAddressRaw = jt.jetton.address;

                const sourceAddressB64url = addressCache[sourceAddressRaw] || sourceAddressRaw;
                const destinationAddressB64url = addressCache[destinationAddressRaw] || destinationAddressRaw;
                const jettonAddressB64url = addressCache[jettonAddressRaw] || jettonAddressRaw;
                
                const isReceived = destinationAddressB64url === currentWalletB64url;
                const isSent = sourceAddressB64url === currentWalletB64url;

                const amountRaw = jt.amount;
                const jettonDecimals = jt.jetton.decimals || APP_CONFIG.JETTON_DEFAULT_DECIMALS;
                const amountJetton = parseFloat(amountRaw) / Math.pow(10, jettonDecimals);

                allLoadedTransactions.push({
                    type: 'JETTON',
                    utime: event.timestamp,
                    isReceived: isReceived,
                    isSent: isSent,
                    fromAddressRaw: sourceAddressRaw,
                    fromAddressB64url: sourceAddressB64url,
                    toAddressRaw: destinationAddressRaw,
                    toAddressB64url: destinationAddressB64url,
                    amountJetton,
                    jettonSymbol: jt.jetton.symbol || "JETTON",
                    jettonImage: jt.jetton.image || '/logo-coin/loi.png',
                    jettonName: jt.jetton.name || "Unknown",
                    jettonAddressRaw: jettonAddressRaw,
                    jettonAddressB64url: jettonAddressB64url,
                    txHashRaw: event.event_id,
                    memo: jt.comment || "No Memo/Comment"
                });
            }
        }
    }

    allLoadedTransactions.sort((a, b) => b.utime - a.utime);

    transactionsList.innerHTML = ""; // Xóa thông báo loading

    if (allLoadedTransactions.length === 0) {
        transactionsList.innerHTML = `
            <div class="no-transactions-message">
                <div>No Jetton transactions found.</div>
            </div>
        `;
        return;
    }

    const initialDisplayCount = 20; // Số lượng giao dịch hiển thị ban đầu
    renderTransactionsBatch(allLoadedTransactions, 0, initialDisplayCount);

    if (allLoadedTransactions.length > initialDisplayCount) {
        const loadMoreBtn = document.createElement("button");
        loadMoreBtn.textContent = "Tải thêm...";
        loadMoreBtn.className = "load-more-btn";
        loadMoreBtn.onclick = () => {
            const batchSize = 20; // Số lượng giao dịch tải thêm mỗi lần click
            renderTransactionsBatch(allLoadedTransactions, currentlyDisplayedTransactions, batchSize);
            if (currentlyDisplayedTransactions >= allLoadedTransactions.length) {
                loadMoreBtn.remove(); // Xóa nút nếu đã tải hết
            }
        };
        transactionsList.appendChild(loadMoreBtn);
    }
}


// --- Popup Functions ---

/**
 * Opens a popup for TON transaction details. (Currently not used as only Jetton transactions are fetched)
 * @param {Object} tx The TON transaction object.
 * @param {string} currentWalletRawAddress The raw address of the current wallet.
 */
async function openTonTransactionPopup(tx, currentWalletRawAddress) {
    console.warn("openTonTransactionPopup called, but TON transactions are not currently displayed.");
    closePopup();

    const popup = document.createElement("div");
    popup.className = "popup-overlay";

    const fromAddressB64url = addressCache[tx.fromAddressRaw] || await convertRawAddressToB64url(tx.fromAddressRaw);
    const toAddressB64url = addressCache[tx.toAddressRaw] || await convertRawAddressToB64url(tx.toAddressRaw);
    const currentWalletB64url = addressCache[currentWalletRawAddress] || await convertRawAddressToB64url(currentWalletRawAddress);

    const isReceived = tx.isReceived && (toAddressB64url === currentWalletB64url);
    const isSent = tx.isSent && (fromAddressB64url === currentWalletB64url);

    let directionInfo = '';
    if (isSent) {
        directionInfo = `<p><strong>To Address:</strong> <span class="long-address">${toAddressB64url}</span></p>`;
    } else if (isReceived) {
        directionInfo = `<p><strong>From Address:</strong> <span class="long-address">${fromAddressB64url}</span></p>`;
    }

    popup.innerHTML = `
        <div class="popup-content">
            <button class="popup-close" onclick="closePopup()"></button>
            <h2>TON Transaction Details</h2>
            <p><strong>Transaction ID:</strong> <span class="long-address">${tx.txHex}</span></p>
            <p><strong>Amount:</strong> ${formatNumberVietnamese(tx.amountTon)} TON</p>
            <p><strong>Fee:</strong> ${formatNumberVietnamese(tx.fee)} TON</p>
            <p><strong>Storage Fee:</strong> ${formatNumberVietnamese(tx.storageFee)} TON</p>
            <p><strong>Other Fee:</strong> ${formatNumberVietnamese(tx.otherFee)} TON</p>
            ${directionInfo}
            <p><strong>Memo:</strong> <span class="memo-content">${tx.memo}</span></p>
            <p><strong>Transaction Time:</strong> ${new Date(tx.utime * 1000).toLocaleString()}</p>
            <p><strong>View on Tonviewer:</strong> <a href="${EXTERNAL_LINKS.TONVIEWER_TRANSACTION(tx.txHex)}" target="_blank">🔎 Click Here</a></p>
        </div>
    `;

    document.body.appendChild(popup);
    popup.addEventListener('click', (event) => {
        if (event.target === popup) {
            closePopup();
        }
    });
}

/**
 * Opens a popup for Jetton transaction details.
 * @param {number} txIndex The index of the Jetton operation object in allLoadedTransactions.
 * @param {string} currentWalletRawAddress The raw address of the current wallet.
 */
async function openJettonTransactionPopup(txIndex, currentWalletRawAddress) {
    closePopup();

    const op = allLoadedTransactions[txIndex];
    if (!op) {
        console.error("Transaction not found at index:", txIndex);
        displayToast('error', '<strong>Transaction details could not be loaded.</strong>');
        return;
    }

    const popup = document.createElement("div");
    popup.className = "popup-overlay";

    // Lấy địa chỉ từ cache
    const sourceAddressB64url = addressCache[op.fromAddressRaw] || op.fromAddressRaw;
    const destinationAddressB64url = addressCache[op.toAddressRaw] || op.toAddressRaw;
    const jettonAddressB64url = addressCache[op.jettonAddressRaw] || op.jettonAddressRaw;
    const currentWalletB64url = addressCache[currentWalletRawAddress] || currentWalletRawAddress;


    const isReceived = op.isReceived && (destinationAddressB64url === currentWalletB64url);
    const isSent = op.isSent && (sourceAddressB64url === currentWalletB64url);

    let directionInfo = '';
    if (isSent) {
        directionInfo = `<p><strong>To Address:</strong> <span class="long-address">${destinationAddressB64url}</span></p>`;
    } else if (isReceived) {
        directionInfo = `<p><strong>From Address:</strong> <span class="long-address">${sourceAddressB64url}</span></p>`;
    }

    popup.innerHTML = `
        <div class="popup-content">
            <button class="popup-close" onclick="closePopup()"></button>
            <h2>Jetton Transaction Details</h2>
            <p><strong>Transaction ID:</strong> <span class="long-address">${op.txHashRaw}</span></p>
            <p><strong>Amount:</strong> ${formatNumberVietnamese(op.amountJetton)} ${op.jettonSymbol}</p>
            <p><strong>Jetton Name:</strong> ${op.jettonName}</p>
            <p><strong>Jetton Address:</strong> <span class="long-address">${jettonAddressB64url}</span></p>
            ${directionInfo}
            <p><strong>Memo:</strong> <span class="memo-content">${op.memo || "No Memo/Comment"}</span></p>
            <p><strong>Transaction Time:</strong> ${new Date(op.utime * 1000).toLocaleString()}</p>
            <p><strong>View on Tonviewer:</strong> <a href="${EXTERNAL_LINKS.TONVIEWER_TRANSACTION(op.txHashRaw)}" target="_blank">🔎 Click Here</a></p>
        </div>
    `;

    document.body.appendChild(popup);
    popup.addEventListener('click', (event) => {
        if (event.target === popup) {
            closePopup();
        }
    });
}

/**
 * Closes any active popup.
 */
function closePopup() {
    const popup = document.querySelector(".popup-overlay");
    if (popup) popup.remove();
}

// --- UI Reset Function ---
function resetWalletUI() {
    walletAddressEl.textContent = "...";
    walletAddressEl.setAttribute("data-full-address-raw", "");
    walletAddressEl.setAttribute("data-full-address-b64url", "");
    walletBalanceEl.textContent = "Số dư: ... TON";
    disconnectBtn.style.display = 'none';
    mainContentSection.style.display = "none";
    connectOnlySection.style.display = "flex";
    transactionsList.innerHTML = '';
    balanceTon = 0;
    allLoadedTransactions = []; // Reset khi ngắt kết nối
    currentlyDisplayedTransactions = 0; // Reset khi ngắt kết nối
    // addressCache = {}; // Có thể reset cache hoặc giữ lại tùy theo logic ứng dụng
}

// --- Telegram Web App Integration ---
function initTelegramWebApp() {
    const tg = window.Telegram?.WebApp;
    if (tg) {
        tg.ready();
        tg.BackButton.show();
        tg.BackButton.onClick(() => {
            window.history.back();
        });
    } else {
        console.warn("Telegram WebApp object not found. Running outside Telegram environment.");
    }
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    connector = new TON_CONNECT_UI.TonConnectUI({
        manifestUrl: APP_CONFIG.MANIFEST_URL,
        buttonRootId: "connect-wallet"
    });

    connector.onStatusChange(async (wallet) => {
        if (wallet) {
            // wallet.account.address is raw address
            await updateWalletInfo(wallet.account.address);
        } else {
            resetWalletUI();
        }
    });

    // Attach event listeners
    qrBtn.addEventListener('click', handleShowQr);
    closeQr.addEventListener('click', handleCloseQr);
    copyBtn.addEventListener('click', handleCopyAddress);
    disconnectBtn.addEventListener('click', () => connector.disconnect());
    sendTonBtn.addEventListener('click', handleSendTon);
    // if (maxTonBtn) { // Đã xóa/chú thích theo yêu cầu trước
    //     maxTonBtn.addEventListener('click', setMaxTON);
    // }
    // toAddressInput.addEventListener('paste', handlePasteFromClipboard); // Đã xóa/chú thích theo yêu cầu trước
    initTelegramWebApp(); // Gọi hàm này để khởi tạo Telegram Web App nếu có
});



// --- Event Listeners for Buttons ---
if (disconnectBtn) {
    disconnectBtn.addEventListener('click', async () => {
        try {
            if (connector) {
                await connector.disconnect();
                console.log('Wallet disconnected successfully.');
                displayToast('success', '<strong>Ví đã ngắt kết nối!</strong>');
                resetWalletUI(); // Gọi hàm để reset giao diện người dùng sau khi ngắt kết nối
            }
        } catch (error) {
            console.error('Error disconnecting wallet:', error);
            displayToast('error', '<strong>Lỗi khi ngắt kết nối ví. Vui lòng thử lại.</strong>');
        }
    });
}

// Hàm này cần được thêm vào nếu chưa có, để đưa UI về trạng thái ban đầu
function resetWalletUI() {
    walletAddressEl.textContent = "Chưa kết nối";
    walletBalanceEl.textContent = "Số dư: 0 TON";
    tonAmountInput.value = '';
    toAddressInput.value = '';
    memoTextInput.value = '';
    transactionsList.innerHTML = '<div class="no-transactions-message">Chưa có giao dịch.</div>';
    disconnectBtn.style.display = 'none';
    connectOnlySection.style.display = 'block';
    mainContentSection.style.display = 'none';
    allLoadedTransactions = [];
    currentlyDisplayedTransactions = 0;
}





// const tg = window.Telegram.WebApp;
tg.ready();
// Nút back luôn luôn bật
    tg.BackButton.show();

    // Khi bấm vào nút back của Telegram
    tg.BackButton.onClick(() => {
      window.history.back(); // Quay lại trang trước khi người dùng mở trang này
    })


