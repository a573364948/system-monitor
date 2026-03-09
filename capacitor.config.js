const config = {
  appId: 'com.deck.systemmonitor',
  appName: 'System Monitor',
  webDir: 'public',
  server: {
    // 开发时指向本机服务器 - 生产环境需要修改
    // url: 'http://192.168.31.248:18489',
    // cleartext: true,
    androidScheme: 'https'
  },
  android: {
    allowMixedContent: true,
    backgroundColor: '#0a0e1a',
    buildOptions: {
      keystorePath: undefined,
      keystorePassword: undefined,
      keystoreAlias: undefined,
      keystoreAliasPassword: undefined,
      releaseType: 'APK'
    }
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#0a0e1a',
      showSpinner: false
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#4a9eff'
    }
  }
};

module.exports = config;
