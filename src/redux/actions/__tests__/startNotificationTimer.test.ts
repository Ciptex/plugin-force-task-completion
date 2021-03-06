import configureStore from 'redux-mock-store';
import { TASK_PENDING_COMPLETION_NOTIFICATION_ID } from './../../../constants/NotificationId';
import { COMPLETION_LIMIT_IN_MILLISECONDS } from './../../../constants/Durations';
import {
  ACTION_START_TIMER,
  ACTION_SNOOZE_TIMER,
} from './../../../constants/ActionTypes';
import startNotificationTimer from '../startNotificationTimer';
import tracker from './../../../utilities/tracker';
import * as selectValidTask from '../../selectors/selectValidTask';
import * as getIsTaskCompletable from '../../../utilities/getIsTaskCompletable';
import * as snoozeNotification from '../snoozeNotification';

const task = {
  taskChannelUniqueName: 'voice',
  queueSid: 'WQ123',
  dateUpdated: Date.now().valueOf() - 100000000,
  taskStatus: 'wrapping',
  conference: {
    participants: [
      {
        isMyself: false,
        status: 'recently_left',
      },
    ],
  },
};

const configuredStore = configureStore();
const store = configuredStore({
  flex: {
    worker: {
      tasks: new Map([['WT123', task]]),
    },
    config: {
      pluginForceTaskCompletion: {
        taskQueues: ['WQ123'],
        taskChannels: ['voice'],
      },
    },
  },
  forceTaskCompletion: {
    timeoutId: 200,
  },
});

global.clearTimeout = jest.fn();

global.Twilio = {
  Flex: {
    Manager: {
      getInstance: () => ({ store }),
    },
    Notifications: {
      dismissNotificationById: jest.fn(),
      showNotification: jest.fn(),
    },
  },
} as any;

describe('startNotificationTimer', () => {
  beforeEach(() => {
    jest.spyOn(tracker, 'track');
    jest.spyOn(snoozeNotification, 'default').mockReturnValue({
      type: ACTION_SNOOZE_TIMER,
      payload: { timeoutId: 300 },
    });
  });

  describe('when the action is called', () => {
    it('returns the correct action', () => {
      global.setTimeout = () => 100 as any;

      const action = startNotificationTimer(COMPLETION_LIMIT_IN_MILLISECONDS);

      expect(action).toEqual({
        type: ACTION_START_TIMER,
        payload: {
          timeoutId: 100,
        },
      });
    });

    it('clears the timeoutId', () => {
      startNotificationTimer(COMPLETION_LIMIT_IN_MILLISECONDS);

      expect(window.clearTimeout).toHaveBeenCalledWith(200);
    });

    it('sets the timeout with the correct duration', () => {
      startNotificationTimer(COMPLETION_LIMIT_IN_MILLISECONDS);

      expect(window.setTimeout).toHaveBeenCalledWith(
        expect.any(Function),
        COMPLETION_LIMIT_IN_MILLISECONDS
      );
    });
  });

  describe('when the timeout created by the action is called', () => {
    describe('and there is no valid task', () => {
      beforeEach(() => {
        jest.spyOn(selectValidTask, 'default').mockReturnValue(undefined);
      });

      it('does not call the tracking utility', () => {
        startNotificationTimer(COMPLETION_LIMIT_IN_MILLISECONDS);

        jest.runAllTimers();

        expect(tracker.track).not.toHaveBeenCalled();
      });
    });

    describe('and the task is completable', () => {
      beforeEach(() => {
        jest
          .spyOn(selectValidTask, 'default')
          .mockReturnValue({ taskSid: 'WT123' } as any);
        jest.spyOn(getIsTaskCompletable, 'default').mockReturnValue(true);
      });

      it('shows the correct notification', () => {
        startNotificationTimer(COMPLETION_LIMIT_IN_MILLISECONDS);

        jest.runAllTimers();

        expect(
          window.Twilio.Flex.Notifications.showNotification
        ).toHaveBeenCalledWith(TASK_PENDING_COMPLETION_NOTIFICATION_ID);
      });

      it('calls the event tracking utility', () => {
        startNotificationTimer(COMPLETION_LIMIT_IN_MILLISECONDS);

        jest.runAllTimers();

        expect(tracker.track).toHaveBeenCalledWith(
          'force task completion activity',
          {
            action: 'notification shown',
            id: 'WT123',
          }
        );
      });

      describe('and the task is not completable', () => {
        beforeEach(() => {
          jest
            .spyOn(selectValidTask, 'default')
            .mockReturnValue({ taskSid: 'WT123' } as any);
          jest.spyOn(getIsTaskCompletable, 'default').mockReturnValue(false);
        });

        it('dispatches a snooze action', () => {
          startNotificationTimer(COMPLETION_LIMIT_IN_MILLISECONDS);
          jest.runOnlyPendingTimers();

          expect(store.getActions()).toEqual([
            {
              type: ACTION_SNOOZE_TIMER,
              payload: {
                timeoutId: 300,
              },
            },
          ]);
        });

        it('calls the event tracking utility', () => {
          startNotificationTimer(COMPLETION_LIMIT_IN_MILLISECONDS);

          jest.runOnlyPendingTimers();

          expect(tracker.track).toHaveBeenCalledWith(
            'force task completion activity',
            {
              action: 'notification snoozed due to active call',
              id: 'WT123',
            }
          );
        });
      });
    });
  });
});
