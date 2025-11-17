@echo off
echo Copying Contract ABIs to Frontend...
echo.

REM Create ABI directory if it doesn't exist
if not exist "TaskerFrontend\client\src\lib\contracts\abis" mkdir "TaskerFrontend\client\src\lib\contracts\abis"

REM Copy core contracts
copy "contracts\artifacts\contracts\core\TaskFactory.sol\TaskFactory.json" "TaskerFrontend\client\src\lib\contracts\abis\" >nul
copy "contracts\artifacts\contracts\core\TaskCore.sol\TaskCore.json" "TaskerFrontend\client\src\lib\contracts\abis\" >nul
copy "contracts\artifacts\contracts\core\TaskVault.sol\TaskVault.json" "TaskerFrontend\client\src\lib\contracts\abis\" >nul
copy "contracts\artifacts\contracts\core\TaskLogicV2.sol\TaskLogicV2.json" "TaskerFrontend\client\src\lib\contracts\abis\" >nul
copy "contracts\artifacts\contracts\core\ExecutorHub.sol\ExecutorHub.json" "TaskerFrontend\client\src\lib\contracts\abis\" >nul
copy "contracts\artifacts\contracts\core\GlobalRegistry.sol\GlobalRegistry.json" "TaskerFrontend\client\src\lib\contracts\abis\" >nul

REM Copy support contracts
copy "contracts\artifacts\contracts\support\ActionRegistry.sol\ActionRegistry.json" "TaskerFrontend\client\src\lib\contracts\abis\" >nul
copy "contracts\artifacts\contracts\support\RewardManager.sol\RewardManager.json" "TaskerFrontend\client\src\lib\contracts\abis\" >nul

REM Copy adapters
copy "contracts\artifacts\contracts\adapters\UniswapV2USDCETHBuyLimitAdapter.sol\UniswapV2USDCETHBuyLimitAdapter.json" "TaskerFrontend\client\src\lib\contracts\abis\" >nul

REM Copy mocks
copy "contracts\artifacts\contracts\mocks\MockERC20.sol\MockERC20.json" "TaskerFrontend\client\src\lib\contracts\abis\" >nul
copy "contracts\artifacts\contracts\mocks\MockUniswapRouter.sol\MockUniswapRouter.json" "TaskerFrontend\client\src\lib\contracts\abis\" >nul
copy "contracts\artifacts\contracts\mocks\MockChainlinkPriceFeed.sol\MockChainlinkPriceFeed.json" "TaskerFrontend\client\src\lib\contracts\abis\" >nul

echo.
echo ✅ ABIs copied successfully!
echo.
echo Files copied:
echo   - TaskFactory.json
echo   - TaskCore.json
echo   - TaskVault.json
echo   - TaskLogicV2.json
echo   - ExecutorHub.json
echo   - GlobalRegistry.json
echo   - ActionRegistry.json
echo   - RewardManager.json
echo   - UniswapV2USDCETHBuyLimitAdapter.json
echo   - MockERC20.json
echo   - MockUniswapRouter.json
echo   - MockChainlinkPriceFeed.json
echo.
pause
