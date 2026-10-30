window.drawFixtureChart = (target) => {
  var chart = document.createElement('div')
  chart.id = 'chart-rendered'
  chart.setAttribute('aria-label', 'Fixture chart')
  chart.innerHTML = '<i style="height:18px"></i><i style="height:32px"></i><i style="height:24px"></i>'
  target.appendChild(chart)
}
