import { forwardedIconSlot, iconSlot } from './icon-slots.ts'

export const PLAYER_MARKUP = `<div class="fit-reserve" aria-hidden="true"></div><div class="player" part="player">
  <div class="body"><div class="screen"><segnavia-stage part="stage"></segnavia-stage><segnavia-refusal part="refusal" exportparts="panel:refusal-panel,heading:refusal-heading,message:refusal-message"></segnavia-refusal></div><segnavia-notes part="notes"></segnavia-notes></div>
  <segnavia-caption part="caption" exportparts="caption,word,word-spoken,word-current"></segnavia-caption>
  <div class="bar" part="bar">
    <segnavia-track exportparts="track,segment"></segnavia-track>
    <div class="control-row">
      <div class="start"><segnavia-counter exportparts="count:counter"></segnavia-counter><span class="time-separator">·</span><segnavia-time exportparts="time"></segnavia-time></div>
      <div class="center"><segnavia-step to="previous" exportparts="step-button,button:previous-button">${forwardedIconSlot('previous')}</segnavia-step><segnavia-play exportparts="button:play-button">${forwardedIconSlot('play')}${forwardedIconSlot('pause')}</segnavia-play><segnavia-step to="next" exportparts="step-button,button:next-button">${forwardedIconSlot('next')}</segnavia-step></div>
      <div class="end"><div class="actions"><slot name="actions"></slot></div><div class="end-controls"><segnavia-mute exportparts="button:mute-button">${forwardedIconSlot('mute')}${forwardedIconSlot('unmute')}</segnavia-mute><segnavia-captions exportparts="button:captions-button">${forwardedIconSlot('captionsOn')}${forwardedIconSlot('captionsOff')}</segnavia-captions><button class="notes-toggle" part="notes-button" data-act="notes" hidden>${iconSlot('notes')}</button><segnavia-fullscreen exportparts="button:presentation-button">${forwardedIconSlot('enterPresentation')}${forwardedIconSlot('exitPresentation')}</segnavia-fullscreen></div></div>
    </div>
  </div><div class="sound-bar" hidden><segnavia-sound></segnavia-sound><segnavia-track exportparts="track:sound-track,segment:sound-segment"></segnavia-track><div class="sound-controls"><segnavia-play exportparts="button:sound-play-button">${forwardedIconSlot('play')}${forwardedIconSlot('pause')}</segnavia-play><segnavia-time exportparts="time:sound-time"></segnavia-time><segnavia-mute exportparts="button:sound-mute-button">${forwardedIconSlot('mute')}${forwardedIconSlot('unmute')}</segnavia-mute></div></div><segnavia-rail exportparts="rail,thumbnail,thumbnail-current,thumbnail-number"></segnavia-rail><div class="below"><slot name="below"></slot></div></div>`
