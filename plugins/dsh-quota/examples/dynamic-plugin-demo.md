# 动态插件（Cordis）示例

> 这是「动态插件」的入门示例，和 `dsh-quota` 这种「静态插件」不同。

## 静态 vs 动态

| | 静态插件（如 dsh-quota） | 动态插件（Cordis） |
|---|---|---|
| 在哪定义 | `dsh.profile.bundles` 列表里 | 运行时由模型用 `cordis_define` 定义 |
| 加载时机 | 程序启动时 | 定义后随时 `cordis_run` 运行 |
| 界面上有开关 | ❌ 没有（只能改配置+重启） | ✅ 有（run/stop 开关卡片） |
| 存活时间 | 永久（每次启动都在） | **临时**（进程重启就没了） |
| 适合场景 | 常驻功能 | 临时实验、运行时扩展 |

## 前提：必须用「创造模式」预设

动态插件需要模型具备 `cordis_define` / `cordis_run` 这套工具，这套工具只在
**「创造模式」**（对应 `cordis` agent preset）里提供。普通「标准模式」没有。

所以要先在界面里把会话的 **Agent 预设** 切成 **「创造模式」**（设置 → 通用里的
Agent preset，或会话的预设选择器），再让模型帮你定义和运行。

## 示例 A：最小版（只有浏览器半，显示一句话）

```js
// code.client（浏览器半）
return {
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return
    slots.inject('tool.view.cordis', () => slots.register(
      { name: 'tool.view.cordis', key: 'self' },
      () => React.createElement('div', null, '你好！这是一个动态插件，正在运行 ✅'),
    ))
  },
}
```

运行后，在 `cordis_run` 卡片里会出现这行字。点「停止」它就消失，点「运行」又回来——这就是动态插件的开关。

## 示例 B：完整版（Host + Client，互相通信）

```js
// code.host（服务端半）
return {
  apply(ctx) {
    harness.handle('demo-greet', async (args) => {
      const name = args && args.name ? args.name : '世界'
      return { message: '你好，' + name + '！来自动态插件 Host 半。' }
    })
  },
}
```

```js
// code.client（浏览器半）
return {
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return
    slots.inject('tool.view.cordis', () => slots.register(
      { name: 'tool.view.cordis', key: 'self' },
      () => {
        const [msg, setMsg] = React.useState('加载中…')
        React.useEffect(() => {
          host.call('demo-greet', { name: '动态插件' })
            .then((r) => setMsg(r.message))
            .catch(() => setMsg('调用失败'))
        }, [])
        return React.createElement('div', null, msg)
      },
    ))
  },
}
```

这个版本演示了：
- Host 半注册了一个方法 `demo-greet`；
- Client 半通过 `host.call('demo-greet', ...)` 调它，把结果显示在卡片里。

## 运行步骤（在「创造模式」下）

1. 把会话预设切成「创造模式」。
2. 直接说：「帮我定义一个动态插件，代码是上面这段」，或让模型自己 `cordis_define` + `cordis_run`。
3. 若提示需要批准（Client 半首次运行会 `awaiting-approval`），在弹出的卡片里点「允许」。
4. 看到卡片里的文字 = 跑通了；点「停止」= 关掉，点「运行」= 再开。

## 注意

- 动态插件的代码是**纯 JavaScript 函数体**，返回 `{ apply(ctx) {...} }`，不能写 `import`、JSX、TypeScript。
- 动态插件**不落盘、不永久**：程序一重启就消失。想让 dsh-quota 常驻，静态插件才是对的；动态插件适合临时实验。
