const fs = require('fs');
const path = require('path');

// 1. 读取 package.json 的版本号
const packageJson = require('./package.json');
const version = packageJson.version; // 例如 "1.2.3"

if (!version) {
  console.error('Error: No version found in package.json');
  process.exit(1);
}

// 2. 生成整数的 Version Code (规则: 1.2.3 -> 10203)
// 保证版本号变大时，这个整数也会变大，满足谷歌商店要求
const [major, minor, patch] = version.split('.').map(Number);
const versionCode = major * 10000 + minor * 100 + patch;

console.log(`Syncing version: ${version} (Code: ${versionCode}) to Android...`);

// 3. 修改 Android 的 build.gradle 文件
const androidGradlePath = path.join(__dirname, 'android/app/build.gradle');

if (fs.existsSync(androidGradlePath)) {
  let gradleContent = fs.readFileSync(androidGradlePath, 'utf8');

  // 使用正则替换 versionName "..."
  gradleContent = gradleContent.replace(
    /versionName\s+"[^"]*"/g, 
    `versionName "${version}"`
  );

  // 使用正则替换 versionCode ...
  gradleContent = gradleContent.replace(
    /versionCode\s+\d+/g, 
    `versionCode ${versionCode}`
  );

  fs.writeFileSync(androidGradlePath, gradleContent);
  console.log('✅ Android version updated successfully!');
} else {
  console.warn('⚠️ Android project not found. Skipping Android version update.');
}