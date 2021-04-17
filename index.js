const fetch = require('node-fetch')
const jsdom = require('jsdom')
const { JSDOM } = jsdom

exports.main_handler = async (event, context) => {
  const timeStart = event && event.Time ? new Date(event.Time) - 360000 : new Date() - 360000
  const pageRequest = await fetch('https://www.tradingview.com/markets/cryptocurrencies/ideas/main/?sort=recent&by=everyone&video=&route_range=1', {
    headers: {
      'x-requested-with': 'XMLHttpRequest'
    }
  })
  const pageText = await pageRequest.json().then(x => x.render_results.content)
  const dom = new JSDOM(pageText)
  const articles = [...dom.window.document.querySelectorAll('[data-widget-type=idea]')]
    .map(x => {
      const card = JSON.parse(x.dataset.card)
      const widgetData = JSON.parse(x.dataset.widgetData)
      return {
        title: widgetData.name,
        symbol: widgetData.short_symbol,
        url: card.data.published_url,
        author: card.author.username,
        timeframe: x.querySelectorAll('.tv-widget-idea__timeframe')[1].textContent,
        timestamp: x.querySelector('.tv-card-stats__time').dataset.timestamp * 1000
      }
    })
    .filter(x => x.timestamp > timeStart)
  const authorRequests = []
  for (let article of articles) {
    authorRequests.push(fetch(`https://www.tradingview.com/u/${article.author}/info/`)
      .then(x => x.json())
      .then(x => {
        article.authorReputation = x.reputation
        article.authorChartsCount = x.charts_count || 1
      })
      .catch(x => {
        article.authorReputation = 0
        article.authorChartsCount = 1
      }))
  }
  await Promise.all(authorRequests)
  const messages = []
  for (let article of articles) {
    if (article.authorReputation / article.authorChartsCount >= 40) {
      messages.push(`标题: ${article.title}
货币符号: ${article.symbol}
时间单位: ${article.timeframe}
作者: ${article.author} (声望: ${article.authorReputation}, 发表数: ${article.authorChartsCount}, 权重: ${Math.round(article.authorReputation / article.authorChartsCount)})
发布时间: ${new Date(article.timestamp)}
文章链接: ${article.url}`)
    }
  }
  const messageRequests = []
  for (let message of messages) {
    messageRequests.push(fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage?chat_id=${process.env.CHAT_ID}&text=${encodeURIComponent(message)}`)
      .then(x => x.json())
      .catch(x => x))
  }
  const sendResults = await Promise.all(messageRequests)
  return { articles, messages, sendResults }
}
