const hour = new Date().getHours();
let time = '';
if (hour < 12) {
  time = '上午';
} else if (hour > 18) {
  time = '晚上';
} else if (hour >= 12) {
  time = '下午';
}

export default {
  theme: {
    token: {
      colorPrimary: '#0068fa',
    },
  },
  slogan: '科技护航数据安全 开源加速数据流通', // 全局标语
  header: {
    logo: null, // Logo is rendered by HeaderComponent to keep login chunks self-contained.
  },
  createProject: {
    showTemplate: true, // 创建项目时是否显示模板选项
  },
  home: {
    HomePageTitle: `${time}好👋，欢迎来到数据沙箱`,
  },
  guide: true, //
};
