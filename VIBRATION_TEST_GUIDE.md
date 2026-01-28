# 振动功能测试指南

## 概述
振动功能已更新，现在支持多种平台：
1. **TapTap 小游戏** - 使用 `tap.vibrateShort()` 和 `tap.vibrateLong()`
2. **Capacitor 原生应用** - 使用 `@capacitor/haptics` 插件
3. **标准浏览器** - 使用 Web Vibration API

## 测试方法

### 1. 在浏览器中测试 (H5)
1. 打开浏览器开发者工具 (F12)
2. 查看 Console 标签页
3. 在游戏中执行任何会触发振动的操作（如下棋、点击按钮等）
4. 观察控制台日志：
   - `[Vibrate] Attempting vibration with pattern: ...` - 开始尝试振动
   - `[Vibrate] Using Web Vibration API` - 使用浏览器 API
   - `[Vibrate] Web vibration result: true/false` - 振动结果

**注意**: 
- 某些浏览器（如 Safari）可能不支持振动 API
- Chrome/Edge 在桌面版通常不支持振动，但在移动版支持
- 需要用户交互后才能触发振动（不能自动触发）

### 2. 在 TapTap 小游戏中测试
1. 将游戏部署到 TapTap 开发者平台
2. 使用 TapTap 开发者工具或真机预览
3. 查看控制台日志：
   - `[Vibrate] Using TapTap vibrateShort API` - 使用 TapTap 短振动
   - `[TapTapBridge] Triggering short vibration: medium` - TapTap 振动触发
   - `[TapTapBridge] Short vibration success` - 振动成功

**TapTap 振动类型**:
- `light` - 轻微振动
- `medium` - 中等振动（默认）
- `heavy` - 强烈振动

### 3. 在 Capacitor 原生应用中测试
1. 构建 Android 应用：
   ```bash
   npm run build
   npx cap sync
   npx cap open android
   ```
2. 在 Android Studio 中运行应用
3. 使用真机测试（模拟器可能不支持振动）
4. 查看 Logcat 日志：
   - `[Vibrate] Using Capacitor Haptics API` - 使用 Capacitor API
   - `[Vibrate] Capacitor vibration success` - 振动成功

## 常见问题

### Q: 浏览器中振动不工作
A: 
- 检查浏览器是否支持 Vibration API（移动浏览器支持更好）
- 确保在用户交互后触发（点击、触摸等）
- 某些浏览器需要 HTTPS 环境

### Q: TapTap 小游戏中振动不工作
A:
- 检查是否在 TapTap 环境中运行（`window.tap` 是否存在）
- 查看控制台是否有错误信息
- 确认 TapTap 开发者平台的权限设置

### Q: Android 应用中振动不工作
A:
- 确认已添加 VIBRATE 权限到 AndroidManifest.xml
- 检查设备振动设置是否开启
- 使用真机测试（模拟器可能不支持）
- 查看 Logcat 日志排查错误

## 振动触发位置

游戏中以下操作会触发振动：
- 下棋/落子
- 点击按钮
- 游戏结束
- 设置更改
- 其他交互操作

## 禁用振动

在游戏设置中可以关闭振动功能：
1. 点击设置按钮
2. 找到"振动"开关
3. 关闭即可禁用所有振动

## 调试日志

所有振动相关的日志都带有 `[Vibrate]` 或 `[TapTapBridge]` 前缀，方便过滤和调试。

## 技术实现

振动功能的优先级顺序：
1. 首先尝试 TapTap 小游戏 API（如果在 TapTap 环境中）
2. 然后尝试 Capacitor Haptics（如果在原生应用中）
3. 最后回退到 Web Vibration API（标准浏览器）

这确保了在所有平台上都能获得最佳的振动体验。
