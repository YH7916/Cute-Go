// Opt-in production UI smoke in a disposable browser profile. Resets that
// profile's coach config; never run in a user's signed-in browser. The cloud
// response is intercepted; this does not validate a paid provider or WebView.
// UI assertions cover the integrated module and select only verified teaching
// choices from the real request; provider-authored arbitrary prose is rejected.
import { loadTestModule } from '../tests/helpers/loadTestModule.mjs';

export async function verifyCoachBrowser(page, baseUrl = 'http://127.0.0.1:4178/') {
  const { renderCoachResponse } = await loadTestModule({
    contents: `export { renderCoachResponse } from './domains/coach/response';`,
  });
  const checks = [];
  const check = (value, name) => { if (!value) throw new Error(name); checks.push(name); };
  const requestTimeout = 50000;
  const context = page.context();
  await page.goto(baseUrl);
  await page.evaluate(() => {
    localStorage.removeItem('cutego.coach.settings.v1');
    localStorage.setItem('cute_go_tutorial_seen', 'true');
    localStorage.setItem('skipStartScreen', 'false');
    localStorage.setItem('musicVolume', '0');
    localStorage.setItem('boardSize', '9');
    localStorage.setItem('gameType', '"Go"');
    localStorage.setItem('showCoordinates', 'true');
    localStorage.setItem('stoneSkin', '"classic"');
    localStorage.setItem('coachSkin', '"chuying"');
    localStorage.setItem('separatePieces', 'true');
  });
  await page.reload();
  await page.setViewportSize({ width: 1280, height: 800 });
  const ai = page.getByRole('button', { name: 'AI 对战', exact: true });
  const practice = page.getByRole('button', { name: '陪我下棋', exact: true });
  const aiBox = await ai.boundingBox(), practiceBox = await practice.boundingBox();
  check(aiBox && practiceBox && Math.abs(aiBox.y - practiceBox.y) < 2 && practiceBox.x > aiBox.x, 'homepage has two aligned columns');
  await page.screenshot({ path: 'output/playwright/coach-home-desktop.png' });
  await page.setViewportSize({ width: 375, height: 667 });
  await page.screenshot({ path: 'output/playwright/coach-home-mobile.png' });
  const panel = page.getByRole('region', { name: 'AI 陪练讲解' });
  const bubble = page.getByRole('status', { name: '褚嬴提示', exact: true });
  const assistant = page.getByRole('complementary', { name: '围棋陪练助手' });
  const message = assistant.locator('[data-coach-message]');
  const reply = text => bubble.filter({ hasText: text });
  const main = page.locator('#root > div.h-full.w-full');
  const character = assistant.getByRole('button', { name: '移动讲解助手', exact: true });
  const conversation = assistant.locator('.coach-conversation');
  const primaryButtons = panel.locator('.coach-actions > button');
  const checkEscapePreservesGuidance = async () => {
    const text = await bubble.count() ? await message.innerText() : null;
    await page.keyboard.press('Escape');
    await settleLayout();
    check(await panel.isVisible() && (text === null ? await bubble.count() === 0 : await message.innerText() === text)
      && await panel.getByRole('button', { name: '更多陪练选项', exact: true }).count() === 0,
    'Escape preserves the current guidance and permanent actions without a dismissal flow');
  };
  const board = page.locator('svg.relative.z-10');
  const blackStones = board.locator('circle[filter="url(#jelly-black)"]');
  const whiteStones = board.locator('circle[filter="url(#jelly-white)"]');
  const settleLayout = () => board.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const disjoint = (first, second) => first && second && (first.x + first.width <= second.x + 1
    || second.x + second.width <= first.x + 1 || first.y + first.height <= second.y + 1
    || second.y + second.height <= first.y + 1);
  const contains = (outer, inner) => outer && inner && inner.x >= outer.x - 1 && inner.y >= outer.y - 1
    && inner.x + inner.width <= outer.x + outer.width + 1 && inner.y + inner.height <= outer.y + outer.height + 1;
  const woodenFrame = () => board.evaluate(element => {
    const { x, y, width, height } = element.closest('.border-4').getBoundingClientRect();
    return { x, y, width, height };
  });
  const checkMainScreen = async label => {
    await settleLayout();
    const metrics = await main.evaluate(element => ({
      height: element.clientHeight, contentHeight: element.scrollHeight, scroll: element.scrollTop,
      width: element.clientWidth, contentWidth: element.scrollWidth,
      documentScroll: document.scrollingElement?.scrollTop ?? 0,
      phoneScroll: innerWidth < 640 || innerHeight >= innerWidth,
    }));
    check(metrics.contentWidth <= metrics.width + 1 && metrics.documentScroll === 0
      && (metrics.phoneScroll || metrics.contentHeight <= metrics.height + 1 && metrics.scroll === 0),
    `${label} no horizontal overflow; short phones may scroll to preserve the board (${JSON.stringify(metrics)})`);
  };
  const checkAssistantLayout = async (label, hasMessage = true) => {
    await settleLayout();
    const viewport = await page.evaluate(() => ({ x: 0, y: 0, width: innerWidth, height: innerHeight }));
    const portrait = viewport.width < 640 || viewport.height >= viewport.width;
    const scrollingPortrait = portrait && await main.evaluate(element => element.scrollHeight > element.clientHeight + 1);
    const floatingCharacter = portrait && viewport.height <= 739;
    const moved = await assistant.getAttribute('data-coach-floating') === 'true';
    check(contains(viewport, await character.locator('.coach-pet').boundingBox()),
      `${label} the complete artwork is visible at the default or requested position before page scrolling`);
    if (scrollingPortrait) await assistant.scrollIntoViewIfNeeded();
    const reviewCount = await panel.getByRole('button', { name: '回看棋谱', exact: true }).count();
    check(await conversation.count() === 1 && await panel.isVisible()
      && await primaryButtons.count() === 2 + reviewCount && await conversation.locator('.coach-tools').count() === 1,
    `${label} one assistant keeps explanation, hint and the available review action in its permanent row`);
    check(await character.count() === 1 && await character.evaluate(element => element.tagName === 'BUTTON'
      && element.type === 'button' && element.tabIndex === 0 && element.getAttribute('aria-hidden') !== 'true')
      && await character.locator('.coach-pet-frame').getAttribute('aria-hidden') === 'true'
      && await assistant.locator('.coach-pet-label').count() === 0
      && await assistant.getByText('问褚嬴', { exact: true }).count() === 0,
    `${label} character is one labelled keyboard-accessible drag handle with decorative artwork`);
    check(await primaryButtons.evaluateAll(buttons => buttons.every(button => {
      const style = getComputedStyle(button);
      return !['transparent', 'rgba(0, 0, 0, 0)'].includes(style.backgroundColor)
        && ['Top', 'Right', 'Bottom', 'Left'].every(side => parseFloat(style[`border${side}Width`]) > 0
          && style[`border${side}Style`] === 'solid');
    })), `${label} primary actions reuse filled buttons with solid borders`);
    const assistantBox = await assistant.boundingBox(), boardBox = await board.boundingBox();
    const characterBox = await character.boundingBox(), conversationBox = await conversation.boundingBox();
    check(contains(viewport, assistantBox) && (scrollingPortrait || contains(viewport, boardBox))
      && contains(viewport, characterBox) && contains(viewport, conversationBox)
      && (moved || contains(assistantBox, conversationBox)),
    `${label} assistant fits on screen; default play also keeps the complete board visible`);
    check((moved || floatingCharacter || disjoint(assistantBox, boardBox) && disjoint(characterBox, boardBox))
      && disjoint(characterBox, conversationBox), `${label} the conversation leaves the character handle unobstructed`);
    check(characterBox.width >= 44 && characterBox.height >= 44 && await character.evaluate(element => {
      const style = getComputedStyle(element), box = element.getBoundingClientRect();
      return style.pointerEvents === 'auto' && style.touchAction === 'none'
        && element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    }), `${label} character has a reachable drag target without scrolling gestures`);
    check(await assistant.evaluate(element => {
      const style = getComputedStyle(element);
      return !['auto', 'scroll'].includes(style.overflowY) && !['auto', 'scroll'].includes(style.overflowX)
        && element.scrollTop === 0 && element.scrollLeft === 0;
    }), `${label} the complete character remains fixed outside message scrolling`);
    check(await board.locator('rect.cursor-pointer').evaluateAll(points => points.length > 0 && points.every(point => {
      const { x, y, width, height } = point.getBoundingClientRect();
      const centerX = x + width / 2, centerY = y + height / 2;
      if (centerX < 0 || centerY < 0 || centerX >= innerWidth || centerY >= innerHeight) return true;
      const overlays = [...document.querySelectorAll('.coach-conversation, .coach-character')];
      if (overlays.some(overlay => {
        const box = overlay.getBoundingClientRect();
        return centerX >= box.x && centerX <= box.right && centerY >= box.y && centerY <= box.bottom;
      })) return true;
      const target = document.elementFromPoint(centerX, centerY);
      return target !== null && !target.closest('.coach-assistant');
    })), `${label} board intersections outside the character and speech remain clickable`);
    check(await conversation.evaluate(element => {
      const style = getComputedStyle(element);
      return element.getAttribute('role') !== 'status'
        && !element.hasAttribute('aria-live')
        && ['Top', 'Right', 'Bottom', 'Left'].every(side => parseFloat(style[`border${side}Width`]) === 2);
    }), `${label} one shared Panel contains speech and tools without announcing control changes`);
    check(await conversation.evaluate(element => {
      const surface = getComputedStyle(element, '::before').backgroundColor;
      return Number(surface.match(/(?:\/|,)\s*([\d.]+)\s*\)$/)?.[1]) === 0.82
        && parseFloat(getComputedStyle(element.querySelector('.coach-tools')).borderTopWidth) === 0;
    }), `${label} speech uses an 82-percent opaque surface without a divider above its actions`);
    if (hasMessage) {
      check(await bubble.count() === 1 && await bubble.isVisible() && await message.count() === 1
        && await message.evaluate(element => ['auto', 'scroll'].includes(getComputedStyle(element).overflowY)),
      `${label} one complete explanation retains its own reading scroll area`);
      const tailBox = await conversation.locator('.coach-speech-tail').boundingBox();
      const side = await conversation.getAttribute('data-coach-side') ?? 'right';
      const pointsAtCharacter = {
        right: conversationBox.x >= characterBox.x + characterBox.width - 1 && tailBox?.x < conversationBox.x,
        left: conversationBox.x + conversationBox.width <= characterBox.x + 1
          && tailBox?.x + tailBox?.width > conversationBox.x + conversationBox.width,
        above: conversationBox.y + conversationBox.height <= characterBox.y + 1
          && tailBox?.y + tailBox?.height > conversationBox.y + conversationBox.height,
        below: conversationBox.y >= characterBox.y + characterBox.height - 1 && tailBox?.y < conversationBox.y,
      };
      check(tailBox && tailBox.width > 0 && tailBox.height > 0 && pointsAtCharacter[side],
        `${label} speech tail follows the character on its selected ${side} side`);
      const speechBox = await bubble.boundingBox(), toolsBox = await panel.boundingBox();
      check(toolsBox.y >= speechBox.y + speechBox.height - 1
        && toolsBox.y - speechBox.y - speechBox.height <= 16,
      `${label} explanation and actions form one compact vertical group`);
    } else {
      check(await bubble.count() === 0 && await message.count() === 0,
        `${label} quiet positions omit unsolicited explanation while keeping the tools`);
    }
    const controls = panel.locator('button, input');
    const actionBoxes = await primaryButtons.evaluateAll(buttons => buttons.map(button => {
      const { x, y, width } = button.getBoundingClientRect();
      return { x, y, width };
    }));
    check(actionBoxes.every((box, index) => index === 0 || Math.abs(box.y - actionBoxes[index - 1].y) > 1
      || box.x - actionBoxes[index - 1].x - actionBoxes[index - 1].width >= 7.5),
      `${label} the action buttons retain an 8px gap even on narrow screens`);
    for (let index = 0; index < await controls.count(); index++) {
      const control = controls.nth(index);
      const box = await control.boundingBox();
      check(await control.isVisible() && box && box.width >= 44 && box.height >= 44
        && contains(await conversation.boundingBox(), box) && contains(viewport, box),
      `${label} control ${index + 1} is reachable with a complete 44px touch target`);
      check(await control.evaluate(element => {
        const box = element.getBoundingClientRect();
        const target = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return target !== null && element.contains(target);
      }), `${label} control ${index + 1} is not covered`);
    }
    const frame = await woodenFrame(), area = await page.locator('.game-board-area').boundingBox();
    check(Math.abs(frame.width - frame.height) <= 1 && contains(area, frame)
      && (scrollingPortrait || contains(viewport, frame)),
    `${label} complete wooden frame stays square and inside its board area`);
    check(await assistant.getByText(/一起看看这盘棋|点我聊聊这步棋|围棋小助手|需要时，点我聊聊/).count() === 0,
      `${label} omits idle filler and repeated introductions`);
    await checkMainScreen(label);
  };
  const checkQuietEntry = async label => {
    await checkAssistantLayout(label, false);
    check(await primaryButtons.count() === 2 && await panel.getByRole('button', { name: '回看棋谱', exact: true }).count() === 0,
      `${label} an empty game keeps explanation and hint but has no record to review`);
  };
  const checkLargestPortraitSquare = async label => {
    const available = await page.locator('.game-board-area').evaluate(element => {
      const style = getComputedStyle(element);
      return Math.min(element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
        element.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom));
    });
    const frame = await woodenFrame();
    check(Math.abs(frame.width - available) <= 1 && Math.abs(frame.height - available) <= 1,
      `${label} complete frame uses the largest square inside its padded area`);
  };
  const checkCompleteReply = async text => {
    await message.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await settleLayout();
    const lastCharacter = await message.evaluate((element, text) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node && !node.textContent?.includes(text)) node = walker.nextNode();
      if (!node) return null;
      const end = node.textContent.indexOf(text) + text.length;
      const range = document.createRange();
      range.setStart(node, end - 1);
      range.setEnd(node, end);
      const { x, y, width, height } = range.getBoundingClientRect();
      return { x, y, width, height };
    }, text);
    check(contains(await message.boundingBox(), lastCharacter), 'message scrolling makes the complete reply ending visible');
    await checkMainScreen('reading the complete reply');
    await message.evaluate(element => { element.scrollTop = 0; });
  };
  const checkCharacterMovement = async () => {
    const text = await message.innerText(), originalBoard = await board.boundingBox();
    const reserved = await assistant.boundingBox(), originalCharacter = await character.boundingBox();
    await character.click();
    await settleLayout();
    check(await message.innerText() === text && await bubble.getAttribute('aria-busy') === 'false'
      && await assistant.getAttribute('data-coach-floating') === null,
    'clicking the character neither asks a question nor moves the assistant');
    await character.press('ArrowUp');
    await settleLayout();
    check(await assistant.getAttribute('data-coach-floating') === 'true'
      && (await character.boundingBox()).y < originalCharacter.y,
    'the focused character can be moved with the keyboard');
    const from = await character.boundingBox(), viewport = page.viewportSize();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(viewport.width - from.width / 2 - 12, viewport.height / 2, { steps: 8 });
    await page.mouse.up();
    await settleLayout();
    check(await assistant.getAttribute('data-coach-floating') === 'true'
      && ['right', 'left', 'above', 'below'].includes(await conversation.getAttribute('data-coach-side')),
    'dragging the character selects a visible side for the existing speech panel');
    check(Math.abs((await assistant.boundingBox()).height - reserved.height) < 1,
      'dragging reserves the original assistant height instead of changing the board layout');
    compareBoardFrame(originalBoard, await board.boundingBox(), 'dragging the assistant');
    check(await message.innerText() === text, 'dragging preserves the complete current explanation');
    await checkAssistantLayout('phone dragged character and following speech');
    await page.screenshot({ path: 'output/playwright/coach-dragged-mobile.png' });
    await character.press('Home');
    await settleLayout();
    check(await assistant.getAttribute('data-coach-floating') === null
      && await message.innerText() === text, 'Home returns the character and speech to their original layout');
    compareBoardFrame(originalBoard, await board.boundingBox(), 'restoring the assistant');
  };
  const pointMatchesMarker = async (marker, point, size) => {
    const hit = await board.locator('rect.cursor-pointer').nth(point.y * size + point.x).boundingBox();
    const mark = await marker.boundingBox();
    return hit && mark && Math.abs(hit.x + hit.width / 2 - mark.x - mark.width / 2) < 1
      && Math.abs(hit.y + hit.height / 2 - mark.y - mark.height / 2) < 1;
  };
  const layout = async () => {
    await settleLayout();
    return {
      header: await page.getByRole('button', { name: '返回首页', exact: true }).boundingBox(),
      score: await page.getByText('黑子', { exact: true }).boundingBox(),
      controls: await page.getByRole('button', { name: '悔棋', exact: true }).boundingBox(),
      board: await board.boundingBox(),
    };
  };
  const scoreCards = () => page.getByText('黑子', { exact: true }).evaluate(element =>
    Array.from(element.closest('.grid').children, card => {
      const { x, y, width, height } = card.getBoundingClientRect();
      return { x, y, width, height };
    }));
  const compareBoardSize = (baseline, current, label) => {
    check(baseline && current && Math.abs(baseline.width - current.width) < 3
      && Math.abs(baseline.height - current.height) < 3, `${label} board size is unchanged`);
  };
  const compareBoardFrame = (baseline, current, label) => {
    compareBoardSize(baseline, current, label);
    check(Math.abs(baseline.x - current.x) < 1 && Math.abs(baseline.y - current.y) < 1,
      `${label} board position is unchanged`);
  };
  const checkPortraitOrder = async (baseline, label) => {
    const current = await layout(), assistantBox = await assistant.boundingBox();
    const sticky = await assistant.evaluate(element => getComputedStyle(element).position === 'sticky');
    check(current.header && current.score && current.controls && current.board && assistantBox
      && current.header.y < current.score.y && current.score.y < current.controls.y
      && current.controls.y + current.controls.height <= current.board.y + 1
      && (sticky || current.board.y + current.board.height <= assistantBox.y + 1),
    `${label} keeps classic game controls above the board and permits the short-screen sticky explanation`);
    check(['header', 'score', 'controls'].every(name => ['x', 'y', 'width', 'height'].every(key =>
      Math.abs(current[name][key] - baseline[name][key]) < 1)),
    `${label} reuses the ordinary game's navigation, score and control geometry`);
    await checkLargestPortraitSquare(label);
  };
  await page.getByRole('button', { name: '本地双人', exact: true }).click();
  const ordinaryMobile = await layout();
  const ordinaryScoreCards = await scoreCards();
  check(ordinaryScoreCards.length === 2 && await page.locator('.coach-game-header, .coach-game-status, .coach-game-controls, .coach-playing-layout').count() === 0,
    'ordinary play retains two score cards and the original controls');
  await page.setViewportSize({ width: 1280, height: 800 });
  const ordinaryDesktop = await layout();
  await page.getByRole('button', { name: '返回首页', exact: true }).click();
  await page.setViewportSize({ width: 375, height: 667 });
  await practice.click();
  check(await panel.isVisible() && await bubble.count() === 0, 'assistant enters quietly with its tools available');
  const noticeHeight = await board.evaluate(element => {
    // The loading notice is a board sibling, not a square board viewport.
    const notice = document.createElement('div');
    notice.className = 'absolute top-4 left-4 px-4 py-2 text-xs';
    notice.textContent = 'AI 正在思考…';
    element.closest('.game-board-area').append(notice);
    try { return notice.getBoundingClientRect().height; }
    finally { notice.remove(); }
  });
  check(noticeHeight > 0 && noticeHeight < 64, 'board sizing never stretches a loading notice to full board height');
  await checkPortraitOrder(ordinaryMobile, 'phone');
  const practiceScoreCards = await scoreCards();
  check(ordinaryScoreCards.length === 2 && practiceScoreCards.length === 2 && ordinaryScoreCards.every((card, index) =>
    ['x', 'y', 'width', 'height'].every(key => Math.abs(card[key] - practiceScoreCards[index][key]) < 1)),
  'practice retains the same two classic score cards and full row width as ordinary play');
  check(await page.locator('.game-play-controls').getByRole('button').count() === 3
    && await page.locator('.coach-game-header, .coach-game-status, .coach-game-controls, .coach-playing-layout').count() === 0,
  'coaching adds its explanation without replacing classic game chrome with a separate compact layout');
  for (const name of ['返回首页', '个人中心', '设置', '悔棋', '停着', '重开']) {
    const box = await page.getByRole('button', { name, exact: true }).boundingBox();
    check(box && box.height >= 44 && box.width >= 44, `${name} remains directly available with a full-size classic game touch target`);
  }
  await page.mouse.move(0, 0);
  await page.screenshot({ path: 'output/playwright/coach-assistant-mobile.png' });
  await checkQuietEntry('375x667 quiet entry');
  for (const size of [{ width: 320, height: 568 }, { width: 328, height: 572 }]) {
    await page.setViewportSize(size);
    const label = `${size.width}x${size.height} quiet entry`;
    await checkQuietEntry(label);
    await checkLargestPortraitSquare(label);
    const quietBoard = await board.boundingBox();
    await checkEscapePreservesGuidance();
    compareBoardFrame(quietBoard, await board.boundingBox(), `${label} after Escape`);
  }
  await page.screenshot({ path: 'output/playwright/coach-fixed-small-phone.png' });
  await page.setViewportSize({ width: 375, height: 667 });
  await board.locator('rect.cursor-pointer').nth(20).click();
  await whiteStones.first().waitFor({ timeout: 15000 });
  check(await blackStones.count() === 1 && await whiteStones.count() === 1, 'local beginner opponent replies with one white stone');
  await page.getByRole('button', { name: '悔棋', exact: true }).click();
  await blackStones.first().waitFor({ state: 'hidden' });
  await whiteStones.first().waitFor({ state: 'hidden' });
  check(true, 'undo restores the position before the human and AI moves');
  await board.locator('rect.cursor-pointer').nth(20).click();
  await whiteStones.first().waitFor({ timeout: 15000 });
  check(await page.getByLabel('向陪练提问').count() === 0, 'unconfigured assistant omits an unusable question form');
  await panel.getByRole('button', { name: '讲解当前局面', exact: true }).click();
  await bubble.waitFor({ timeout: requestTimeout });
  check(await bubble.getByText('本地', { exact: true }).count() === 1 && (await message.innerText()).length > 2,
    'unconfigured explanation produces local teaching for the displayed position');
  await checkAssistantLayout('phone local explanation');
  await checkCharacterMovement();
  await checkEscapePreservesGuidance();
  const primaryActions = ['讲解当前局面', '给点提示', '回看棋谱'];
  for (const name of primaryActions) {
    const box = await panel.getByRole('button', { name, exact: true }).boundingBox();
    check(box && box.height >= 44, `${name} has a phone-sized touch target`);
    check(contains(await assistant.boundingBox(), box), `${name} is visible without scrolling the assistant`);
  }
  const compactBox = await panel.boundingBox();
  check(compactBox && compactBox.height <= 48 && await panel.getByRole('button').count() === 3,
    'default conversation exposes only three actions in one touch-sized row');
  check(await panel.getByRole('button', { name: '陪练设置', exact: true }).count() === 0
    && await panel.getByText('连接 AI', { exact: true }).count() === 0,
  'service connection does not occupy a permanent action row');
  const settingsButton = page.getByRole('button', { name: '设置', exact: true });
  await settingsButton.scrollIntoViewIfNeeded();
  const settingsBox = await settingsButton.boundingBox();
  check(settingsBox && settingsBox.height >= 44 && settingsBox.width >= 44,
    'service settings remain accessible through the existing full-size top-bar settings button');
  check(await panel.getByRole('checkbox', { name: '关键变化时讲解', exact: true }).count() === 0,
    'key-change teaching is always active without an extra control');
  check(await panel.getByRole('button', { name: '更多陪练选项', exact: true }).count() === 0
    && await panel.getByRole('button', { name: '收起陪练讲解', exact: true }).count() === 0,
  'coaching has no secondary menu or dismissal controls');
  await checkAssistantLayout('phone permanent actions', true);
  await page.screenshot({ path: 'output/playwright/coach-panel-mobile.png' });
  await settingsButton.click();
  check(await page.getByLabel('陪练 API 密钥').count() === 0, 'main settings expose a service menu without credentials');
  await page.getByRole('button', { name: '陪练讲解服务', exact: true }).click();
  check(await page.getByRole('button', { name: '应用设置并重新开始', exact: true }).count() === 0, 'service submenu omits game restart');
  await page.getByRole('button', { name: '返回设置', exact: true }).click();
  check(await page.getByLabel('陪练 API 密钥').count() === 0, 'back returns to main settings');
  await page.getByRole('button', { name: '陪练讲解服务', exact: true }).click();
  const provider = page.getByRole('radiogroup', { name: '陪练服务商' });
  const deepSeek = provider.getByRole('radio', { name: 'DeepSeek', exact: true });
  check(await deepSeek.isVisible(), 'DeepSeek preset is available without assuming a configured default');
  await deepSeek.check();
  check(await deepSeek.isChecked(), 'selecting the DeepSeek preset updates the active provider');
  await page.getByLabel('陪练 API 密钥').fill('temporary-preset-key');
  await provider.getByRole('radio', { name: 'OpenAI', exact: true }).check();
  check(await page.getByLabel('陪练 API 密钥').inputValue() === '', 'changing provider clears previous key');
  await provider.getByRole('radio', { name: '自定义', exact: true }).check();
  await page.getByLabel('陪练 API 地址').fill('https://coach.test.invalid/v1');
  await page.getByLabel('陪练模型', { exact: true }).fill('test-coach');
  await page.getByLabel('陪练 API 密钥').fill('ui-test-key');
  const remember = page.getByRole('button', { name: '在此设备记住密钥', exact: true });
  if (await remember.getAttribute('aria-pressed') === 'true') await remember.click();
  await page.getByRole('button', { name: '保存陪练设置', exact: true }).click();
  check(!await page.evaluate(() => localStorage.getItem('cutego.coach.settings.v1')?.includes('ui-test-key')), 'API key stays out of localStorage when remembering is disabled');
  await page.screenshot({ path: 'output/playwright/coach-api-settings-mobile.png' });
  await page.getByRole('button', { name: '关闭设置', exact: true }).click();
  check(await blackStones.count() === 1 && await whiteStones.count() === 1, 'saving API settings does not reset the board');
  check(await page.getByLabel('向陪练提问').isVisible(),
    'configured conversation makes its question form available immediately');
  const checkQuestion = async () => {
    await page.getByLabel('向陪练提问').scrollIntoViewIfNeeded();
    check(await page.getByLabel('向陪练提问').isVisible(), 'the configured composer is always reachable without opening another panel');
  };
  await checkQuestion();
  check(await page.getByLabel('向陪练提问').evaluate(element => parseFloat(getComputedStyle(element).fontSize) >= 16), 'phone question input uses at least 16px text');
  const question = page.getByLabel('向陪练提问');
  const questionBox = await question.boundingBox();
  const sendBox = await panel.getByRole('button', { name: '发送问题', exact: true }).boundingBox();
  check(questionBox && questionBox.height >= 44 && sendBox && sendBox.height >= 44
    && contains(await assistant.boundingBox(), questionBox) && contains(await assistant.boundingBox(), sendBox),
  'configured question input and send button are full-sized and fully visible');
  await checkAssistantLayout('phone question composer', false);
  await question.fill('保留这份尚未发送的草稿');
  await checkEscapePreservesGuidance();
  await checkAssistantLayout('phone configured permanent composer', false);
  check(await question.inputValue() === '保留这份尚未发送的草稿', 'Escape preserves the always-visible unsent question draft');
  await question.fill('');

  const requests = [], preparedReplies = [];
  let responseMode = 'success';
  let responseParts = ['concept.liberties', 'concept.connection', 'concept.capture'];
  let release, notifyHeld;
  let heldStarted = new Promise(resolve => { notifyHeld = resolve; });
  const waitForHeld = async () => {
    let timer;
    try {
      await Promise.race([heldStarted, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('held cloud request did not start within 50 seconds')), requestTimeout);
      })]);
    } finally { clearTimeout(timer); }
  };
  const workerUrls = [];
  const recordWorker = worker => { workerUrls.push(worker.url()); };
  const parseEvidence = request => {
    const message = request.messages[1].content;
    const prefix = '局面证据：\n', separator = '\n玩家问题：';
    const end = message.indexOf(separator, prefix.length);
    if (!message.startsWith(prefix) || end < 0) throw new Error('cloud request is missing structured board evidence');
    return JSON.parse(message.slice(prefix.length, end));
  };
  const waitForReply = async text => {
    await reply(text).waitFor({ timeout: requestTimeout });
    check(await assistant.evaluate((element, text) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode(), count = 0;
      while (node) { if (node.textContent?.includes(text)) count++; node = walker.nextNode(); }
      return count === 1;
    }, text) && !(await panel.innerText()).includes(text),
    'conversation keeps a single complete reply without repeating it in the tools');
    await checkMainScreen('cloud reply in permanent conversation');
  };
  const requestReply = async action => {
    const index = requests.length;
    await action();
    const deadline = Date.now() + requestTimeout;
    while (!preparedReplies[index]) {
      if (Date.now() >= deadline) throw new Error('structured cloud request did not start within 50 seconds');
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    await waitForReply(preparedReplies[index].text);
    return preparedReplies[index];
  };
  const handler = async route => {
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }
    const request = route.request().postDataJSON();
    const evidence = parseEvidence(request);
    const content = JSON.stringify({ kind: 'explain', parts: responseParts.map(id => ({ id, variant: 0 })) });
    const rendered = renderCoachResponse(content, evidence.teachingChoices, false, evidence.boardSize);
    if (!rendered || rendered.kind !== 'explain') throw new Error('fixture selected unavailable verified teaching choices');
    requests.push(request);
    preparedReplies.push(rendered);
    const mode = responseMode;
    if (mode === 'held') await new Promise(resolve => { release = resolve; notifyHeld(); });
    if (mode === 'failure') {
      await route.fulfill({ status: 503, headers, body: 'test upstream failure' });
    } else {
      await route.fulfill({ headers, contentType: 'application/json', body: JSON.stringify({
        choices: [{ message: { content }, finish_reason: 'stop' }],
      }) }).catch(() => {});
    }
  };
  // Dedicated teaching Workers bypass page.route. Keep the context route scoped
  // to this synthetic endpoint so model assets still use the real local server.
  await context.route('https://coach.test.invalid/**', handler);
  page.on('worker', recordWorker);
  try {
    // This ordinary two-stone opening has no capture or endangered group.
    await page.waitForTimeout(1100);
    check(requests.length === 0 && await bubble.count() === 0,
      'automatic coaching stays silent and sends no API request for an ordinary opening');
    const fullReply = (await requestReply(() => panel.getByRole('button', { name: '讲解当前局面', exact: true }).click())).text;
    check(requests.length === 1 && requests[0].model === 'test-coach', 'configured API request reaches the compatible endpoint');
    check(workerUrls.some(url => /\/agent\/coach\/worker\.ts(?:\?|$)|\/worker-[^/]+\.js(?:\?|$)/.test(url)), 'cloud explanation runs through the dedicated teaching Worker');
    check(!requests[0].messages[1].content.includes('positionKey') && !JSON.stringify(requests[0]).includes('ui-test-key'), 'cloud payload excludes full history identity and credential');
    const firstEvidence = parseEvidence(requests[0]);
    check(firstEvidence.teachingRequest.intent === 'explain-position', 'the primary explanation requests the current position');
    check(firstEvidence.boardSize === 9 && firstEvidence.moveNumber === 2, 'cloud explanation receives the actual 9x9 two-move position');
    check(firstEvidence.engineAnalysis?.source === 'local-katago' && firstEvidence.engineAnalysis.visits > 0
      && firstEvidence.engineAnalysis.perspective === 'black', 'cloud explanation includes real local KataGo analysis with positive visits');
    check(firstEvidence.lastAction.globalMoveNumber === 2 && firstEvidence.stones.length === 2
      && firstEvidence.stones.some(stone => stone.color === 'black') && firstEvidence.stones.some(stone => stone.color === 'white'),
    'engine and rule evidence describe the displayed two-move board');
    check(firstEvidence.boardGuide?.lastMove?.marker === 'red-dot'
      && JSON.stringify(firstEvidence.boardGuide.lastMove.point) === JSON.stringify(firstEvidence.lastAction.point)
      && await pointMatchesMarker(board.locator('circle[fill="#ff4444"]'), firstEvidence.lastAction.point, firstEvidence.boardSize),
    'cloud last-move guide matches the actual red dot on the board');
    check(await message.evaluate(element => {
      const style = getComputedStyle(element);
      return style.textOverflow !== 'ellipsis' && ['none', ''].includes(style.webkitLineClamp);
    }), 'reply text remains complete without ellipsis or a line clamp');
    await page.setViewportSize({ width: 320, height: 568 });
    await checkAssistantLayout('small phone with full reply and composer', true);
    check(await message.evaluate(element => element.scrollTop) === 0, 'a long reply starts at the top of the message');
    await checkCompleteReply(fullReply);
    await page.screenshot({ path: 'output/playwright/coach-full-bubble-small-phone.png' });
    const smallReplyBoard = await board.boundingBox();
    await checkQuestion();
    await checkEscapePreservesGuidance();
    compareBoardFrame(smallReplyBoard, await board.boundingBox(), 'small phone permanent composer after Escape');
    await page.setViewportSize({ width: 1280, height: 800 });
    await checkAssistantLayout('desktop with full reply', true);
    const desktopReplyBoard = await board.boundingBox();
    await checkEscapePreservesGuidance();
    compareBoardFrame(desktopReplyBoard, await board.boundingBox(), 'desktop persistent reply');

    await page.setViewportSize({ width: 375, height: 667 });
    responseMode = 'held';
    responseParts = ['concept.reading', 'concept.liberties'];
    await panel.getByRole('button', { name: '讲解当前局面', exact: true }).click();
    await waitForHeld();
    await settleLayout();
    const scrollBeforeReply = await main.evaluate(element => element.scrollTop);
    const boardBeforeReply = await board.boundingBox();
    release?.();
    await waitForReply(preparedReplies.at(-1).text);
    await settleLayout();
    check(Math.abs(await main.evaluate(element => element.scrollTop) - scrollBeforeReply) < 1,
      'completed cloud explanation does not steal the player scroll position');
    compareBoardFrame(boardBeforeReply, await board.boundingBox(), 'completed cloud explanation');
    check(await panel.isVisible() && await question.isVisible(), 'a completed reply retains the primary actions and configured question row');
    await checkAssistantLayout('phone completed reply with permanent composer');

    responseMode = 'success';
    responseParts = ['concept.liberties'];
    await question.fill('这里有几口气？');
    await requestReply(() => panel.getByRole('button', { name: '发送问题', exact: true }).click());
    check(requests.at(-1).messages[1].content.includes('这里有几口气')
      && parseEvidence(requests.at(-1)).teachingRequest.intent === 'explain-position', 'freeform question is sent with current position facts');
    check(await question.inputValue() === '', 'sending a question clears only the submitted draft');

    responseParts = ['current'];
    const hinted = await requestReply(() => panel.getByRole('button', { name: '给点提示', exact: true }).click());
    const hintEvidence = parseEvidence(requests.at(-1));
    const guide = hintEvidence.boardGuide?.markers;
    const markers = board.locator('g[aria-label="陪练棋盘标记"] > g');
    check(hintEvidence.moveNumber === firstEvidence.moveNumber
      && JSON.stringify(hintEvidence.stones) === JSON.stringify(firstEvidence.stones)
      && hintEvidence.engineAnalysis?.visits > 0, 'hint analysis still belongs to the same displayed board');
    check(Array.isArray(guide) && guide.length > 0 && guide.length <= 3
      && hinted.hintPoints.length === guide.length && await markers.count() === guide.length,
    'the selected current explanation draws exactly its referenced board-guide points');
    let pointsMatch = true;
    for (const [index, reference] of guide.entries()) {
      const badge = markers.nth(index).locator('text');
      const expectedNumber = guide.length > 1 ? index + 1 : null;
      pointsMatch &&= reference.number === expectedNumber
        && (expectedNumber === null ? await badge.count() === 0 : (await badge.textContent())?.trim() === String(expectedNumber))
        && await pointMatchesMarker(markers.nth(index).locator(':scope > circle'), reference.point, hintEvidence.boardSize)
        && hinted.hintPoints[index].x === reference.point.x && hinted.hintPoints[index].y === reference.point.y
        && hintEvidence.engineAnalysis.candidates.some(item => item.point.x === reference.point.x && item.point.y === reference.point.y)
        && !hintEvidence.stones.some(stone => stone.point.x === reference.point.x && stone.point.y === reference.point.y);
    }
    check(pointsMatch, 'single points remain unnumbered and multiple SVG references match the verified engine guide');
    await page.screenshot({ path: 'output/playwright/coach-board-guide-mobile.png' });
    await checkEscapePreservesGuidance();

    responseMode = 'failure';
    await panel.getByRole('button', { name: '给点提示', exact: true }).click();
    await page.getByText(/HTTP 503/).waitFor({ timeout: requestTimeout });
    check(await assistant.getByText('本地', { exact: true }).count() === 1, 'HTTP failure falls back to local guidance');
    check(await assistant.getByText('本地', { exact: true }).evaluate(element => {
      const box = element.getBoundingClientRect();
      return box.width <= 1 && box.height <= 1;
    }), 'guidance source remains accessible without consuming visible speech space');
    check(!await page.getByRole('button', { name: '停着', exact: true }).isDisabled(), 'explanation failure does not block game controls');

    responseMode = 'held';
    responseParts = ['concept.liberties', 'concept.connection', 'concept.capture'];
    heldStarted = new Promise(resolve => { notifyHeld = resolve; });
    await panel.getByRole('button', { name: '讲解当前局面', exact: true }).click();
    await assistant.locator('[aria-label="褚嬴提示"][aria-busy="true"]').waitFor();
    await waitForHeld();
    const cancelledText = preparedReplies.at(-1).text;
    check(await panel.getByRole('button', { name: '停止讲解', exact: true }).isVisible(),
      'an in-flight explanation exposes cancellation in the primary action row');
    await panel.getByRole('button', { name: '停止讲解', exact: true }).click();
    await panel.getByRole('button', { name: '讲解当前局面', exact: true }).waitFor();
    release?.();
    await page.waitForTimeout(200);
    check(!(await assistant.innerText()).includes(cancelledText), 'cancelled response cannot replace the current local explanation');
    heldStarted = new Promise(resolve => { notifyHeld = resolve; });
    await panel.getByRole('button', { name: '讲解当前局面', exact: true }).click();
    await waitForHeld();
    const resetText = preparedReplies.at(-1).text;
    await page.getByRole('button', { name: '重开', exact: true }).click();
    release?.();
    await bubble.waitFor({ state: 'hidden' });
    check(await blackStones.count() === 0 && await whiteStones.count() === 0, 'reset clears both stone colors');
    check(!(await assistant.innerText()).includes(resetText), 'old cloud reply cannot restore pre-reset explanation');

    await page.setViewportSize({ width: 1280, height: 800 });
    await checkAssistantLayout('desktop quiet entry with configured composer', false);
    const desktopBoard = await board.boundingBox(), desktopAssistant = await assistant.boundingBox();
    check(ordinaryDesktop.board && desktopBoard
      && desktopBoard.width >= ordinaryDesktop.board.width - 1 && desktopBoard.height >= ordinaryDesktop.board.height - 1,
    'desktop coaching reserves at least as much board space as ordinary play');
    check(desktopAssistant.x >= desktopBoard.x + desktopBoard.width, 'landscape explanation uses the existing right sidebar');
    await page.mouse.move(0, 0);
    await page.screenshot({ path: 'output/playwright/coach-assistant-desktop.png' });
    await checkQuestion();
    compareBoardFrame(desktopBoard, await board.boundingBox(), 'desktop permanent question composer');
    for (const height of [375, 320]) {
      await page.setViewportSize({ width: 667, height });
      const label = `667x${height} landscape`;
      const landscapeBoard = await board.boundingBox(), landscapeAssistant = await assistant.boundingBox();
      check(landscapeAssistant.x >= landscapeBoard.x + landscapeBoard.width, `${label} explanation stays in the right sidebar`);
      responseMode = 'success';
      responseParts = ['concept.opening', 'concept.liberties'];
      await requestReply(() => panel.getByRole('button', { name: '给点提示', exact: true }).click());
      await checkAssistantLayout(`${label} reply and permanent composer`, true);
      compareBoardFrame(landscapeBoard, await board.boundingBox(), `${label} reply`);
      await checkQuestion();
      await checkEscapePreservesGuidance();
      compareBoardFrame(landscapeBoard, await board.boundingBox(), `${label} persistent controls`);
    }
    await page.screenshot({ path: 'output/playwright/coach-short-landscape-composer.png' });

    // Review is the final game operation: its toolbar no longer offers an exit
    // back into play, so fault/cancellation checks must finish before entering.
    await page.setViewportSize({ width: 375, height: 667 });
    await board.locator('rect.cursor-pointer').nth(20).click();
    await whiteStones.first().waitFor({ timeout: 15000 });
    check(await blackStones.count() === 1 && await whiteStones.count() === 1,
      'the post-reset game has a real human move and AI reply to review');
    const beforeReview = await board.locator('circle[filter^="url(#jelly-"]').evaluateAll(stones =>
      stones.map(stone => [stone.getAttribute('cx'), stone.getAttribute('cy'), stone.getAttribute('filter')]));
    const requestsBeforeReview = requests.length;
    await panel.getByRole('button', { name: '回看棋谱', exact: true }).click();
    const reviewSlider = page.getByRole('slider', { name: '棋谱进度', exact: true });
    await reviewSlider.waitFor();
    check(await reviewSlider.inputValue() === '2',
      'the permanent review action enters at the displayed record endpoint');
    check(await page.getByRole('button', { name: '退出复盘', exact: true }).count() === 0,
      'the compact review toolbar does not restore the removed exit action');
    await page.waitForTimeout(1100);
    check(requests.length === requestsBeforeReview, 'opening review does not start an unsolicited cloud request');
    const reviewedStones = await board.locator('circle[filter^="url(#jelly-"]').evaluateAll(stones =>
      stones.map(stone => [stone.getAttribute('cx'), stone.getAttribute('cy'), stone.getAttribute('filter')]));
    check(JSON.stringify(beforeReview) === JSON.stringify(reviewedStones),
      'the review endpoint preserves every stone from the original live position');
    await page.getByRole('button', { name: '返回首页', exact: true }).click();
    check(await page.locator('.coach-assistant').count() === 0, 'returning home removes either live or review assistant');
    await page.getByRole('button', { name: '本地双人', exact: true }).click();
    check(await assistant.count() === 0, 'ordinary local play stays separate from coaching');
    await page.setViewportSize({ width: 375, height: 667 });
    const restoredScoreCards = await scoreCards();
    check(await page.locator('.coach-game-header, .coach-game-status, .coach-game-controls, .coach-playing-layout').count() === 0
      && restoredScoreCards.length === ordinaryScoreCards.length
      && ordinaryScoreCards.every((card, index) => ['x', 'y', 'width', 'height'].every(key =>
        Math.abs(card[key] - restoredScoreCards[index][key]) < 1)),
    'leaving practice restores the original ordinary-play score layout');
  } finally {
    release?.();
    page.off('worker', recordWorker);
    await context.unroute('https://coach.test.invalid/**', handler);
  }
  return { ok: true, checks, requestCount: requests.length, provider: 'intercepted structured-choice endpoint', nativeAndroid: 'not tested' };
}
