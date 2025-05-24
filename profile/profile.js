// Khởi tạo Telegram Web App
const tg = window.Telegram.WebApp;
tg.ready();

// Hiển thị nút Back và xử lý sự kiện click
tg.BackButton.show();
tg.BackButton.onClick(() => {
    window.history.back();
});

// Hàm hiển thị thông báo sao chép thành công
const showCopySuccess = (label) => {
    Swal.fire({
        icon: 'success',
        title: 'Đã sao chép!',
        text: `${label} đã được sao chép vào clipboard.`,
        timer: 1500,
        showConfirmButton: false,
        customClass: {
            container: 'swal-container',
            popup: 'swal-popup',
            title: 'swal-title',
            htmlContainer: 'swal-html-container',
            icon: 'swal-icon'
        },
        didOpen: () => {
            // Tùy chỉnh CSS cho SweetAlert2 nếu cần
            const style = document.createElement('style');
            style.innerHTML = `
                .swal-popup {
                    border-radius: 15px !important;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.2) !important;
                }
                .swal-title {
                    font-size: 1.5em !important;
                    color: #333 !important;
                }
                .swal-html-container {
                    font-size: 1.1em !important;
                    color: #555 !important;
                }
                .swal-icon.swal-success .swal-success-ring {
                    border-color: #4CAF50 !important;
                }
                .swal-icon.swal-success [class^='swal2-success-line'][class$='tip'] {
                    background-color: #4CAF50 !important;
                }
                .swal-icon.swal-success [class^='swal2-success-line'][class$='long'] {
                    background-color: #4CAF50 !important;
                }
            `;
            document.head.appendChild(style);
        }
    });
};

// Hàm sao chép văn bản vào clipboard
const copyToClipboard = async (text, label) => {
    try {
        await navigator.clipboard.writeText(text);
        showCopySuccess(label);
    } catch (err) {
        Swal.fire({
            icon: 'error',
            title: 'Thất bại',
            text: `Không thể sao chép ${label}. Vui lòng thử lại.`,
            timer: 1500,
            showConfirmButton: false
        });
        console.error(`Lỗi khi sao chép ${label}:`, err);
    }
};

// Hàm lấy và hiển thị thông tin người dùng Telegram
const loadTelegramUserInfo = () => {
    const user = tg.initDataUnsafe.user;

    if (user) {
        const name = `${user.first_name || ''} ${user.last_name || ''}`.trim();
        const username = user.username ? `@${user.username}` : 'Không có';
        const userId = user.id;

        document.getElementById("tg-name").textContent = name || 'N/A';
        document.getElementById("tg-username").textContent = username;
        document.getElementById("tg-id").textContent = userId;

        // Gán sự kiện copy cho các nút
        document.getElementById("copy-name").onclick = () => copyToClipboard(name, "Tên");
        document.getElementById("copy-username").onclick = () => copyToClipboard(username, "Username");
        document.getElementById("copy-id").onclick = () => copyToClipboard(userId.toString(), "ID");

        const avatarElement = document.getElementById("tg-avatar");
        const photoURL = user.photo_url || "/logo-coin/bmlogo.jpg"; // Fallback nếu không có photo_url
        avatarElement.src = photoURL;
        avatarElement.onerror = function() {
            // Nếu ảnh lỗi, chuyển về ảnh mặc định
            this.onerror = null;
            this.src = "/logo-coin/bmlogo.jpg";
        };
    } else {
        // Xử lý trường hợp không có thông tin người dùng Telegram
        document.getElementById("tg-name").textContent = 'Không có thông tin';
        document.getElementById("tg-username").textContent = 'Không có thông tin';
        document.getElementById("tg-id").textContent = 'Không có thông tin';
        document.getElementById("tg-avatar").src = "/logo-coin/bmlogo.jpg";
    }
};

// Hàm hiển thị trạng thái loading cho các trường thông tin ví
const setWalletInfoLoadingState = () => {
    document.getElementById("short-address").textContent = "Đang tải...";
    document.getElementById("friendly-address").textContent = "Đang tải...";
    document.getElementById("ton-balance").textContent = "Đang tải...";
};

// Hàm lấy thông tin địa chỉ base64 và Friendly
const fetchAddressInfo = async (rawAddress) => {
    const shortAddressElem = document.getElementById("short-address");
    const friendlyAddressElem = document.getElementById("friendly-address");
    const copyBase64Icon = document.getElementById("copy-base64-icon");
    const copyFriendlyIcon = document.getElementById("copy-friendly-icon");

    shortAddressElem.textContent = "Đang tải...";
    friendlyAddressElem.textContent = "Đang tải...";

    try {
        // Lấy thông tin base64 và Friendly từ cùng một API nếu có thể
        const detectRes = await fetch(`https://toncenter.com/api/v2/detectAddress?address=${rawAddress}`);
        const detectData = await detectRes.json();

        if (detectData.ok && detectData.result) {
            const base64Addr = detectData.result.bounceable.b64; // Sử dụng bounceable.b64 cho base64
            const friendlyAddr = detectData.result.non_bounceable.b64url;

            const shortBase64 = `${base64Addr.slice(0, 8)}...${base64Addr.slice(-8)}`;
            const shortFriendly = `${friendlyAddr.slice(0, 8)}...${friendlyAddr.slice(-8)}`;

            shortAddressElem.textContent = shortBase64;
            friendlyAddressElem.textContent = shortFriendly;

            // Gán sự kiện copy
            shortAddressElem.onclick = () => copyToClipboard(base64Addr, "Địa chỉ base64");
            copyBase64Icon.onclick = () => copyToClipboard(base64Addr, "Địa chỉ base64");

            friendlyAddressElem.onclick = () => copyToClipboard(friendlyAddr, "Địa chỉ Friendly");
            copyFriendlyIcon.onclick = () => copyToClipboard(friendlyAddr, "Địa chỉ Friendly");

        } else {
            shortAddressElem.textContent = "Không lấy được địa chỉ.";
            friendlyAddressElem.textContent = "Không lấy được địa chỉ.";
            console.warn("Không lấy được thông tin địa chỉ từ detectAddress:", detectData);
        }
    } catch (err) {
        shortAddressElem.textContent = "Lỗi tải địa chỉ.";
        friendlyAddressElem.textContent = "Lỗi tải địa chỉ.";
        console.error("Lỗi khi fetch địa chỉ:", err);
        Swal.fire({
            icon: 'error',
            title: 'Lỗi mạng',
            text: 'Không thể kết nối để lấy thông tin địa chỉ.',
            timer: 2000,
            showConfirmButton: false
        });
    }
};

// Hàm lấy số dư TON
const fetchTonBalance = async (rawAddress) => {
    const tonBalanceElem = document.getElementById("ton-balance");
    tonBalanceElem.textContent = "Đang tải...";

    try {
        const balanceRes = await fetch(`https://tonapi.io/v2/accounts/${rawAddress}`);
        const balanceData = await balanceRes.json();

        if (balanceData && balanceData.balance) {
            // Chuyển đổi từ nanoTON sang TON và làm tròn
            const ton = (parseFloat(balanceData.balance) / 10**9).toFixed(9);
            tonBalanceElem.textContent = `${ton} TON`;
        } else {
            tonBalanceElem.textContent = "Không có số dư.";
        }
    } catch (err) {
        tonBalanceElem.textContent = "Lỗi lấy số dư.";
        console.error("Lỗi khi fetch số dư TON:", err);
        Swal.fire({
            icon: 'error',
            title: 'Lỗi mạng',
            text: 'Không thể kết nối để lấy số dư TON.',
            timer: 2000,
            showConfirmButton: false
        });
    }
};

// Khởi tạo TonConnectUI
const connector = new TON_CONNECT_UI.TonConnectUI({
    manifestUrl: "https://bmweb.site/tonconnect-manifest.json",
    buttonRootId: "connect-wallet"
});

// Xử lý thay đổi trạng thái kết nối ví
connector.onStatusChange(async (wallet) => {
    if (wallet) {
        // Ví đã kết nối
        const rawAddress = wallet.account.address;
        document.getElementById("connect-only").style.display = "none";
        document.getElementById("main-content").style.display = "block";

        setWalletInfoLoadingState(); // Hiển thị trạng thái loading ngay lập tức

        // Thực hiện các lời gọi API song song để tối ưu tốc độ
        await Promise.all([
            fetchAddressInfo(rawAddress),
            fetchTonBalance(rawAddress)
        ]);

    } else {
        // Ví đã ngắt kết nối
        document.getElementById("main-content").style.display = "none";
        document.getElementById("connect-only").style.display = "flex";
        // Reset các trường thông tin ví khi ngắt kết nối
        document.getElementById("short-address").textContent = "...";
        document.getElementById("friendly-address").textContent = "...";
        document.getElementById("ton-balance").textContent = "Loading...";
    }
});

// Xử lý sự kiện ngắt kết nối ví
document.getElementById("disconnect").onclick = async () => {
    const disconnectButton = document.getElementById("disconnect");
    disconnectButton.classList.add("loading"); // Sử dụng class 'loading' thay vì 'spin'

    try {
        await connector.disconnect();
        // UI sẽ được cập nhật thông qua onStatusChange
        Swal.fire({
            icon: 'info',
            title: 'Đã ngắt kết nối',
            text: 'Bạn đã ngắt kết nối ví TON.',
            timer: 2000,
            showConfirmButton: false
        });
    } catch (error) {
        Swal.fire({
            icon: 'error',
            title: 'Lỗi',
            text: 'Không thể ngắt kết nối ví. Vui lòng thử lại.',
        });
        console.error("Lỗi khi ngắt kết nối ví:", error);
    } finally {
        disconnectButton.classList.remove("loading");
    }
};

// Gọi hàm để tải thông tin người dùng Telegram khi trang tải
document.addEventListener('DOMContentLoaded', loadTelegramUserInfo);