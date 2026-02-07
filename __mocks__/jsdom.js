const actualJsdom = jest.requireActual('jsdom');

const JSDOM = jest.fn((html) => {
    const actualDom = new actualJsdom.JSDOM(html);
    return {
        window: {
            document: {
                querySelector: jest.fn((selector) => actualDom.window.document.querySelector(selector)),
                querySelectorAll: jest.fn((selector) => actualDom.window.document.querySelectorAll(selector)),
                title: actualDom.window.document.title,
            },
        },
    };
});

module.exports = { JSDOM };
