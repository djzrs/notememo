# 📝 Notememo 备忘录

一个使用 **Cloudflare Workers** 部署的轻量备忘录应用。支持新建、编辑、删除、搜索、完成标记、置顶，数据可持久化到 Cloudflare KV。

## ✨ 功能

- 新建 / 编辑 / 删除备忘录
- 实时搜索（标题 + 内容）
- 完成标记、置顶
- 相对时间显示（刚刚 / x 分钟前 / x 小时前 / 日期）
- 响应式设计，手机和电脑均可使用
- 数据持久化到 Cloudflare KV（配置后）

## 🚀 部署

本仓库已绑定 Cloudflare，**代码推送到 GitHub 后会自动触发部署**。

### 方式一：直接推送（已配置自动部署）

```bash
git add .
git commit -m "deploy notememo"
git push origin main
```

Cloudflare 会自动构建并部署，部署完成后访问：

```
https://notememo.<你的子域>.workers.dev
```

### 配置 KV 持久化（强烈推荐）

默认情况下，未配置 KV 时数据保存在 Worker **内存**中，Worker 重启后会丢失。要持久化：

1. 登录 [Cloudflare 控制台](https://dash.cloudflare.com)
2. 进入 **Workers & Pages** → 选择 `notememo` Worker
3. 左侧菜单 **设置** → **变量** → **KV Namespace 绑定**
4. 点击 **添加绑定**：
   - 变量名称：`NOTES`
   - KV 命名空间：新建一个（或选择已有）
5. 点击 **保存**，Worker 会自动重新部署
6. 刷新应用页面，顶部黄色「内存模式」横幅消失，说明数据已持久化

> 也可以直接在 `wrangler.toml` 中取消 `[[kv_namespaces]]` 注释并填入真实 namespace id 后推送。

## 💻 本地开发

```bash
npm install
npm run dev
```

`wrangler dev` 会启动本地开发服务器，默认地址 `http://localhost:8787`。

## 📡 API 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/notes` | 获取全部备忘录 |
| POST | `/api/notes` | 新建备忘录 |
| PUT | `/api/notes/:id` | 更新备忘录（标题 / 内容 / 完成 / 置顶） |
| DELETE | `/api/notes/:id` | 删除备忘录 |

### 请求示例

```bash
# 新建
curl -X POST https://<你的域名>/api/notes \
  -H "Content-Type: application/json" \
  -d '{"title":"买牛奶","content":"记得买两盒"}'