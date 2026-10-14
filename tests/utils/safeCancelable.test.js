const SafePCancelable = require('../../src/utils/safeCancelable');

describe('SafePCancelable', () => {
    it('should resolve normally', async () => {
        const p = new SafePCancelable((resolve) => {
            resolve('success');
        });
        await expect(p).resolves.toBe('success');
    });

    it('should reject normally', async () => {
        const p = new SafePCancelable((resolve, reject) => {
            reject(new Error('failure'));
        });
        await expect(p).rejects.toThrow('failure');
    });

    it('should allow normal cancellation when pending', async () => {
        let cancelRan = false;
        const p = new SafePCancelable((resolve, reject, onCancel) => {
            onCancel(() => {
                cancelRan = true;
            });
        });

        p.cancel();
        expect(p.isCanceled).toBe(true);
        expect(cancelRan).toBe(true);
        await expect(p).rejects.toThrow('Promise was canceled');
    });

    it('should gracefully ignore onCancel calls made after the promise has settled', async () => {
        let capturedOnCancel;
        const p = new SafePCancelable((resolve, reject, onCancel) => {
            capturedOnCancel = onCancel;
            resolve('done');
        });

        const result = await p;
        expect(result).toBe('done');

        // Calling onCancel after settlement should be safely ignored rather than throwing
        expect(() => {
            capturedOnCancel(() => {});
        }).not.toThrow();
    });

    it('should not execute cancellation handler when onCancel is registered after settlement', async () => {
        let capturedOnCancel;
        const p = new SafePCancelable((resolve, reject, onCancel) => {
            capturedOnCancel = onCancel;
            resolve('settled');
        });

        await expect(p).resolves.toBe('settled');

        let handlerRan = false;
        expect(() => {
            capturedOnCancel(() => {
                handlerRan = true;
            });
        }).not.toThrow();

        expect(handlerRan).toBe(false);
    });

    it('should rethrow unrelated errors thrown during onCancel registration', () => {
        expect(() => {
            SafePCancelable._handleOnCancelError(new Error('Unrelated error'));
        }).toThrow('Unrelated error');

        expect(() => {
            SafePCancelable._handleOnCancelError(
                new Error(SafePCancelable.SETTLED_ONCANCEL_ERROR_MESSAGE)
            );
        }).not.toThrow();
    });

    it('should preserve shouldReject property on onCancel', () => {
        let capturedOnCancel;
        new SafePCancelable((resolve, reject, onCancel) => {
            capturedOnCancel = onCancel;
            resolve();
        });

        expect(capturedOnCancel.shouldReject).toBe(true);
        capturedOnCancel.shouldReject = false;
        expect(capturedOnCancel.shouldReject).toBe(false);
    });

    it('should safely handle delayed timer attaching onCancel after rejection (Got v11 retry race)', async () => {
        let capturedOnCancel;
        const p = new SafePCancelable((resolve, reject, onCancel) => {
            capturedOnCancel = onCancel;
            reject(new Error('immediate rejection'));
        });

        await expect(p).rejects.toThrow('immediate rejection');

        // Simulate Got Timeout.retry firing in setTimeout after settlement
        await new Promise((resolve) => {
            setTimeout(() => {
                expect(() => {
                    capturedOnCancel(() => {});
                }).not.toThrow();
                resolve();
            }, 10);
        });
    });

    it('should patch require.cache for p-cancelable so dependencies use SafePCancelable', () => {
        const PCancelable = require('p-cancelable');
        expect(PCancelable).toBe(SafePCancelable);
    });

    it('should ensure got instances use SafePCancelable', () => {
        const { PassThrough } = require('stream');
        const got = jest.requireActual('got');
        const mockRequest = () => {
            const stream = new PassThrough();
            stream.abort = jest.fn();
            return stream;
        };

        const p = got('http://mock.test', { request: mockRequest });
        p.catch(() => {});
        expect(p).toBeInstanceOf(SafePCancelable);
        p.cancel();
    });

    describe('fn static wrapper', () => {
        it('should return a function that creates a SafePCancelable instance with safe late onCancel behavior', async () => {
            let capturedOnCancel;
            const wrapped = SafePCancelable.fn((arg, onCancel) => {
                capturedOnCancel = onCancel;
                return Promise.resolve(`hello ${arg}`);
            });

            const p = wrapped('world');
            expect(p).toBeInstanceOf(SafePCancelable);
            await expect(p).resolves.toBe('hello world');

            // Late onCancel should not throw
            expect(() => {
                capturedOnCancel(() => {});
            }).not.toThrow();
        });
    });
});
