// Automatically activate the currently open tab
const currentPage = location.pathname.split("/").pop();
const items = document.querySelectorAll(".footer-item");
items.forEach(item => {
  const page = item.getAttribute("data-page");
  if (page === currentPage) {
    item.classList.add("active");
  }
});

const tg = Telegram.WebApp;
tg.ready();
tg.BackButton.show();
tg.BackButton.onClick(() => window.history.back());
const user = tg.initDataUnsafe?.user;

if (user) {
  const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
  const avatarUrl = user.username
    ? `https://t.me/i/userpic/320/${user.username}.jpg`
    : ''; // Telegram does not have an official API to get avatar if there is no username

  const nameEl = document.getElementById('telegram-name');
  const avatarEl = document.getElementById('telegram-avatar');

  nameEl.textContent = fullName || user.username || "Người dùng";
  if (avatarUrl) {
    avatarEl.src = avatarUrl;
    avatarEl.style.display = 'inline-block';
  }
}

const connectUI = new TON_CONNECT_UI.TonConnectUI({
  manifestUrl: 'https://bmweb.site/tonconnect-manifest.json',
  buttonRootId: 'connect-wallet'
});

async function fetchJettons(walletAddress) {
  const loadingSpinner = document.getElementById('loading-spinner');
  const list = document.getElementById('jettons-list');
  const zeroList = document.getElementById('zero-balance-list');
  const seeAllBtn = document.getElementById('see-all-btn');
  const tokenHeader = document.getElementById('token-header');
  const totalAmountDiv = document.getElementById('total-amount'); // This element might not be used directly for the total amount display

  loadingSpinner.style.display = 'block';
  list.innerHTML = '';
  zeroList.innerHTML = '';
  zeroList.style.display = 'none';
  seeAllBtn.style.display = 'none';

  try {
    // 1. Get TON Coin balance
    const tonRes = await fetch(`https://tonapi.io/v2/accounts/${walletAddress}`);
    const tonData = await tonRes.json();
    const tonBalance = parseFloat(tonData.balance) / 1e9;

    // 2. Get TON/USDT exchange rate from OKX
    const okxRes = await fetch('https://www.okx.com/api/v5/market/ticker?instId=TON-USDT');
    const okxData = await okxRes.json();
    const tonPrice = parseFloat(okxData.data[0].last);
    const tonOpen = parseFloat(okxData.data[0].open24h);
    const tonChange = ((tonPrice - tonOpen) / tonOpen) * 100;
    const changeSign = tonChange >= 0 ? '+' : '';

    // 3. Calculate total value in USDT
    const tonValueInUSDT = tonBalance * tonPrice;

    // 4. Get USDT/VND exchange rate from CoinGecko
    const vndRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=vnd');
    const vndData = await vndRes.json();
    const usdtToVnd = vndData.tether.vnd;

    // 5. Calculate TON value in VND
    const tonValueInVND = tonValueInUSDT * usdtToVnd;

    // TON HTML
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
            (${changeSign}${tonChange.toFixed(2)}%)
          </p>
        </div>
      </div>
    `;

    // Get BTC/USDT price
    const btcRes = await fetch('https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT');
    const btcData = await btcRes.json();
    const btcPrice = parseFloat(btcData.data[0].last);
    const btcOpen = parseFloat(btcData.data[0].open24h);
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

    // Get ETH/USDT price
    const ethRes = await fetch('https://www.okx.com/api/v5/market/ticker?instId=ETH-USDT');
    const ethData = await ethRes.json();
    const ethPrice = parseFloat(ethData.data[0].last);
    const ethOpen = parseFloat(ethData.data[0].open24h);
    const ethChange = ((ethPrice - ethOpen) / ethOpen) * 100;
    const ethChangeSign = ethChange >= 0 ? '+' : '';
    const ethPriceVND = ethPrice * usdtToVnd;

    // ETH
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

    // Display on the interface
    list.innerHTML += tonHTML;
    list.innerHTML += btcHTML;
    list.innerHTML += ethHTML;

    // 4. Get jetton list with USDT price
    const response = await fetch(`https://tonapi.io/v2/accounts/${walletAddress}/jettons?currencies=usdt`);
    const data = await response.json();
    loadingSpinner.style.display = 'none';

    if (!data.balances || data.balances.length === 0) {
      tokenHeader.style.display = 'none';
      return;
    }
    tokenHeader.style.display = 'block';

    const zeroBalanceJettons = [];
    let totalJettonValueInUSDT = 0;

    for (const jetton of data.balances) {
      const decimals = jetton.jetton.decimals || 9;
      const balance = parseFloat(jetton.balance) / (10 ** decimals);
      const formattedBalance = balance.toLocaleString("vi-VN", {
        minimumFractionDigits: 0,
        maximumFractionDigits: decimals > 5 ? 5 : decimals
      });

      const name = jetton.jetton.name || '';
      const symbol = jetton.jetton.symbol || '';
      const image = jetton.jetton.image || 'https://duccodedao.github.io/web/logo-coin/bmlogo.jpg';
      const jettonAddress = jetton.jetton.address;
      const isVerified = jetton.jetton.verification === "whitelist";
      const verifiedBadge = isVerified
        ? '<img src="https://upload.wikimedia.org/wikipedia/commons/e/e4/Twitter_Verified_Badge.svg" alt="verified" width="16" class="verified-badge">'
        : '';

      const isSuspicious = !isVerified || image.includes("placeholder");
      const warningIcon = isSuspicious
        ? '<img src="https://cdn-icons-png.flaticon.com/512/1828/1828843.png" alt="warning" width="16" title="Token not verified or suspicious" class="warning-badge">'
        : '';

      let priceUSDT = jetton.price?.prices?.USDT || 0;

      // Get 24h fluctuation percentage in price.diff_24h.USDT (string like "−10.25%")
      const change24hRaw = jetton.price?.diff_24h?.USDT || null;

      // Convert fluctuation string to number (remove % sign and special minus sign)
      let change24hNumber = null;
      if (change24hRaw) {
        // Remove % sign and special minus sign if present
        const normalized = change24hRaw.replace(/[−–]/g, '-').replace('%', '');
        change24hNumber = parseFloat(normalized);
      }

      // Create + or - sign for display
      const changeSign = (change24hNumber !== null && change24hNumber > 0) ? '+' : '';

      const priceAndChangeHTML = priceUSDT
        ? `<p>$${priceUSDT.toFixed(6)} ${change24hNumber !== null ? `(<span style="color: ${change24hNumber >= 0 ? 'green' : 'red'}">${changeSign}${change24hNumber.toFixed(2)}%</span>)` : ''}</p>`
        : '';

      // Calculate Jetton value in USDT and VND
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
          <a href="https://tonviewer.com/${walletAddress}/jetton/${jettonAddress}" class="jetton-address-link" target="_blank">View</a>
        </div>
      `;

      if (balance > 0) {
        list.innerHTML += itemHTML;
      } else {
        zeroBalanceJettons.push(itemHTML);
      }
    }

    // --- Logic for Total Balance and 24h Change ---
    const allValueInUSDT = tonValueInUSDT + totalJettonValueInUSDT;
    const allValueInVND = allValueInUSDT * usdtToVnd;

    let totalChange24hText = ''; // This will hold the text for the 24h change
    const last24hTotalAmount = localStorage.getItem('last24hTotalAmount');
    const lastUpdateTimestamp = localStorage.getItem('lastUpdateTimestamp');
    const ONE_DAY_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

    // Check if we need to refresh the stored old amount
    if (!last24hTotalAmount || !lastUpdateTimestamp || (Date.now() - parseInt(lastUpdateTimestamp) > ONE_DAY_MS)) {
      // Store current total amount as the old amount
      localStorage.setItem('last24hTotalAmount', allValueInUSDT.toString());
      localStorage.setItem('lastUpdateTimestamp', Date.now().toString());
      console.log('Stored new total amount for 24h change calculation.');
      // If a new amount is stored, we don't have a previous 24h change to show yet.
      totalChange24hText = `<span style="color: grey; font-size: 0.9em;">(--% 24h)</span>`; // Indicate no data yet
    } else {
      const oldAmount = parseFloat(last24hTotalAmount);

      // Handle cases where oldAmount is zero or no change
      if (oldAmount === 0 && allValueInUSDT === 0) {
        totalChange24hText = `<span style="color: grey; font-size: 0.9em;">(0.00% 24h)</span>`;
      } else if (oldAmount === 0 && allValueInUSDT !== 0) {
        // If old amount was zero and now there's a value, it's a 100% increase
        totalChange24hText = `<span style="color: green; font-size: 0.9em;">(+100.00% 24h)</span>`;
      } else if (allValueInUSDT === oldAmount) {
        // If current and old amounts are the same, display 0%
        totalChange24hText = `<span style="color: grey; font-size: 0.9em;">(0.00% 24h)</span>`;
      } else {
        const percentageChange = ((allValueInUSDT - oldAmount) / oldAmount) * 100;
        const changeColor = percentageChange >= 0 ? 'green' : 'red';
        const changePrefix = percentageChange >= 0 ? '+' : '';
        totalChange24hText = `<span style="color: ${changeColor}; font-size: 0.9em;">
                                ${changePrefix}${percentageChange.toFixed(2)}% (24h)
                              </span>`;
      }
    }
    // --- End Logic for Total Balance and 24h Change ---

    // Modified totalAssetHTML to put amount and percentage on one line
    const totalAssetHTML = `
      <div class="jetton-item total-asset">
        <div class="jetton-info">
          <strong>Total Balance</strong>
          <div id="friendly-address-wrapper">
            <span id="friendly-address">Đang tải địa chỉ...</span>
            <i id="copy-friendly-icon" class="fas fa-copy"></i>
          </div>
          <p>
            ≈ $${allValueInUSDT.toLocaleString("en-US", { minimumFractionDigits: 2 })} ≈ 
            ${allValueInVND.toLocaleString("vi-VN", { style: 'currency', currency: 'VND' })}
            ${totalChange24hText} </p>
        </div>
      </div>
    `;

    list.innerHTML = totalAssetHTML + list.innerHTML; // ✅ Place at the beginning

    async function loadFriendlyAddress() {
      try {
        const res = await fetch(`https://toncenter.com/api/v2/detectAddress?address=${walletAddress}`);
        const detectData = await res.json();

        if (detectData.ok && detectData.result) {
          const friendlyAddr = detectData.result.non_bounceable.b64url;
          const shortFriendly = `${friendlyAddr.slice(0, 8)}...${friendlyAddr.slice(-8)}`;
          document.getElementById("friendly-address").textContent = shortFriendly;

          const copyFriendly = () => {
            navigator.clipboard.writeText(friendlyAddr).then(() => {
              Swal.fire({
                icon: 'success',
                title: 'Đã sao chép!',
                toast: true,
                position: 'top-right',
                timer: 2000,
                showConfirmButton: false,
                timerProgressBar: true,
                padding: '10px 15px',
                customClass: {
                  popup: 'swal2-toast-success',
                  title: 'swal2-toast-title'
                }
              });
            }).catch(() => {
              Swal.fire({
                icon: 'error',
                title: 'Thất bại',
                toast: true,
                position: 'top-right',
                timer: 2000,
                showConfirmButton: false,
                timerProgressBar: true,
                padding: '10px 15px',
                customClass: {
                  popup: 'swal2-toast-error',
                  title: 'swal2-toast-title'
                }
              });
            });
          };

          document.getElementById("friendly-address").onclick = copyFriendly;
          document.getElementById("copy-friendly-icon").onclick = copyFriendly;
        } else {
          document.getElementById("friendly-address").textContent = "Không thể lấy ví.";
        }
      } catch {
        document.getElementById("friendly-address").textContent = "Lỗi API.";
      }
    }

    loadFriendlyAddress();

    if (zeroBalanceJettons.length > 0) {
      seeAllBtn.style.display = 'block';
      let expanded = false; // state whether the list is expanded

      seeAllBtn.onclick = () => {
        const zeroList = document.getElementById('zero-balance-list');
        if (!expanded) {
          zeroList.innerHTML = zeroBalanceJettons.join('');
          zeroList.style.display = 'block';
          seeAllBtn.textContent = '------- Collapse -------';
        } else {
          zeroList.style.display = 'none';
          seeAllBtn.textContent = '------- See all -------';
        }
        expanded = !expanded;
      };
    }

  } catch (error) {
    loadingSpinner.style.display = 'none';
    console.error('ERROR', error);
  }
}

// The fetchJettonInfo function remains unchanged
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJettonInfo(jettonAddress) {
  const jettonInfoContainer = document.getElementById('jetton-info-container');
  document.getElementById('jetton-info-popup').style.display = 'block';

  // Display loading spinner
  jettonInfoContainer.innerHTML = `
    <div class="spinner"></div>
    <p style="text-align: center; margin-top: 10px;">Loading information...</p>
  `;
  // Create a fake delay of 1.5 seconds
  await delay(1500);

  try {
    const response = await fetch(`https://tonapi.io/v2/jettons/${jettonAddress}`);
    const jettonData = await response.json();

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
              alt="warning" width="16" style="vertical-align: middle;  margin-bottom: 3px;">
          </span>`;

      const decimals = Number(jettonData.metadata?.decimals || 0);
      const holders = Number(jettonData.holders_count).toLocaleString();
      const rawSupply = BigInt(jettonData.total_supply);
      const supply = Number(rawSupply / BigInt(10 ** decimals)).toLocaleString();

      let imageUrl = jettonData.metadata?.image || '';
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
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Symbol:</strong> ${symbol}</p>
        <p><strong>Address:</strong> <a href="https://tonviewer.com/${jettonAddress}" target="_blank">Tonviewer</a></p>
        <p><strong>Description:</strong> ${description}</p>
        <p><strong>Holders:</strong> ${holders}</p>
        <p><strong>Supply:</strong> ${supply}</p>
        <p><strong>Status:</strong> ${verification}</p>
        ${websitesHTML}
        ${socialsHTML}
      `;

      jettonInfoContainer.innerHTML = jettonHTML;
    }
  } catch (error) {
    jettonInfoContainer.innerHTML = 'ERROR';
    console.error('ERROR', error);
  }
}

connectUI.onStatusChange(async (wallet) => {
  const disconnectButton = document.getElementById('disconnect-wallet');
  const connectOnlyDiv = document.getElementById('connect-only');
  const tokenHeader = document.getElementById('token-header');
  const seeAllBtn = document.getElementById('see-all-btn');
  const totalAmountDiv = document.getElementById('total-amount');

  if (wallet && wallet.account) {
    connectOnlyDiv.style.display = 'none';
    disconnectButton.style.display = 'block';
    tokenHeader.style.display = 'block';
    seeAllBtn.style.display = 'block';
    totalAmountDiv.style.display = 'none'; // Hidden because price is no longer displayed

    await fetchJettons(wallet.account.address);

    disconnectButton.addEventListener('click', () => {
      connectUI.disconnect();
      connectOnlyDiv.style.display = 'flex';
      disconnectButton.style.display = 'none';
      tokenHeader.style.display = 'none';
      seeAllBtn.style.display = 'none';
      totalAmountDiv.style.display = 'none';
      document.getElementById('jettons-list').innerHTML = '';
      document.getElementById('zero-balance-list').innerHTML = '';
    });
  } else {
    connectOnlyDiv.style.display = 'flex';
    disconnectButton.style.display = 'none';
    tokenHeader.style.display = 'none';
    seeAllBtn.style.display = 'none';
    totalAmountDiv.style.display = 'none';
    document.getElementById('jettons-list').innerHTML = '';
    document.getElementById('zero-balance-list').innerHTML = '';
  }
});