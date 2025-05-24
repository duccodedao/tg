const tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
    manifestUrl: 'https://bmasshd.click/tonconnect-manifest.json',
    buttonRootId: 'ton-connect'
});

async function fetchWalletData(wallet) {
    if (!wallet) return;

    const walletAddress = wallet.account.address.toString();
    document.getElementById('wallet-address').textContent = walletAddress;
    document.getElementById('wallet-info').style.display = "block";

    try {
        // ✅ Lấy số dư TON từ TonAPI
        const tonResponse = await fetch(`https://tonapi.io/v2/accounts/${walletAddress}`);
        const tonData = await tonResponse.json();
        const tonBalance = (tonData.balance / 1e9).toFixed(9); // Chuyển sang TON
        document.getElementById('wallet-balance').textContent = `${tonBalance} TON`;

        // ✅ Lấy giá TON/USDT từ CoinGecko
        const priceResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd');
        const priceData = await priceResponse.json();
        const tonPrice = priceData['the-open-network'].usd;

        // ✅ Hiển thị giá trị USDT của số dư TON
        const usdtValue = (tonBalance * tonPrice).toFixed(2);
        document.getElementById('wallet-usdt-value').textContent = `≈ ${usdtValue} USDT`;

        // ✅ Lấy danh sách token trong ví
        const tokenResponse = await fetch(`https://tonapi.io/v2/accounts/${walletAddress}/tokens`);
        const tokenData = await tokenResponse.json();

        // ✅ Kiểm tra token BMC
        const tokenBMC = tokenData.balances.find(token => token.jetton_address === 'EQCvxJy4eG8hyHBFsZ7eePxrRsUQSFE_jpptRAYBmcG_DOGS');
        if (tokenBMC) {
            document.getElementById('token-balance').textContent = `${(tokenBMC.balance / 1e9).toFixed(2)} BMC`;
        } else {
            document.getElementById('token-balance').textContent = "0 BMC";
        }

    } catch (error) {
        console.error("Lỗi khi lấy dữ liệu:", error);
    }
}

// Lắng nghe sự kiện kết nối
tonConnectUI.onStatusChange(async (wallet) => {
    if (wallet) {
        fetchWalletData(wallet);
    }
});