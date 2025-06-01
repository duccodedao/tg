
// Khởi tạo Telegram Web App
const tg = window.Telegram.WebApp;
tg.ready();

// Hiển thị nút Back
tg.BackButton.show();
tg.BackButton.onClick(() => {
    window.history.back();
});

// 👉 Hiển thị nút "MainButton" như nút "Close"
tg.MainButton.setText("Close App");
tg.MainButton.show();
tg.MainButton.onClick(() => {
    tg.close(); // Gọi API để đóng mini app
});

let balanceTon = 0; // Khai báo biến toàn cục để lưu số dư

const connector = new TON_CONNECT_UI.TonConnectUI({
    manifestUrl: "http://bmweb.site//tonconnect-manifest.json",
    buttonRootId: "connect-wallet"
});

connector.onStatusChange(async (wallet) => {
    const connectOnly = document.getElementById("connect-only");
    const mainContent = document.getElementById("main-content");

    if (wallet) {
        // Khi ví kết nối: ẩn connectOnly (fade-out), hiện mainContent (fade-in)
        if (connectOnly) { // Kiểm tra để đảm bảo phần tử tồn tại
            connectOnly.style.opacity = '0';
            setTimeout(() => {
                connectOnly.style.display = "none";
                if (mainContent) {
                    mainContent.style.display = "block";
                    setTimeout(() => mainContent.style.opacity = '1', 50); // Fade-in
                }
            }, 300); // Thời gian fade-out
        }

        // ... phần còn lại như bạn đã làm cho trạng thái kết nối
        // Ví dụ: cập nhật địa chỉ ví, số dư
        // Đảm bảo các phần tử này có style opacity: 0; và transition trong CSS
        // khi mới được tạo hoặc khi ẩn đi
        const walletAddress = document.getElementById("wallet-address");
        if (walletAddress) walletAddress.textContent = wallet.account.address;
        // ... các cập nhật khác

    } else {
        // Nếu mất kết nối hoặc chưa kết nối ví: ẩn mainContent (fade-out), hiện connectOnly (fade-in)
        if (mainContent) {
            mainContent.style.opacity = '0';
            setTimeout(() => {
                mainContent.style.display = "none";
                if (connectOnly) {
                    connectOnly.style.display = "flex";
                    setTimeout(() => connectOnly.style.opacity = '1', 50); // Fade-in
                }
            }, 300); // Thời gian fade-out
        }

        // ... phần còn lại như bạn đã làm cho trạng thái không kết nối
        document.getElementById("wallet-address").textContent = "...";
        document.getElementById("wallet-address").setAttribute("data-full-address", "");
        document.getElementById("wallet-balance").textContent = "Số dư: ... TON";
        document.getElementById("disconnect").style.display = 'none';
    }
});
