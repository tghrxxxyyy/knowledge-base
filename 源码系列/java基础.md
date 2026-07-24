## 1.**Timer、ScheduledThreadPool、DelayQueue**

可以看出Timer实际就是根据任务的执行时间维护了一个优先队列，并且起了一个线程不断地拉取任务执行，根据代码可以看到有三个问题：

优先队列的插入和删除的时间复杂度是O(logn)，当任务量大的时候，频繁的入堆出堆性能有待考虑

单线程执行，如果一个任务执行的时间过久则会影响下一个任务的执行时间(当然你任务的run要是异步执行也行)

从代码中可以看到对异常没有做什么处理，那么一个任务出错的时候会导致之后的任务都无法执行

```java
class TaskQueue {
    private TimerTask[] queue = new TimerTask[128];
    void add(TimerTask task) {
        // Grow backing store if necessary
        if (size + 1 == queue.length)
            queue = Arrays.copyOf(queue, 2*queue.length); //扩容
 
 
        queue[++size] = task; //先将任务添加到数组最后面
        fixUp(size); //调整堆
    }
    private void fixUp(int k) { //时间复杂度为O(logn)
        while (k > 1) {
            int j = k >> 1;
            if (queue[j].nextExecutionTime <= queue[k].nextExecutionTime)//通过任务执行时间对比，调整顺序
                break;
            TimerTask tmp = queue[j];  queue[j] = queue[k]; queue[k] = tmp;
            k = j;
        }
    }
  /**
     * Return the "head task" of the priority queue.  (The head task is an
     * task with the lowest nextExecutionTime.)
     */
    TimerTask getMin() {
        return queue[1]; //返回最接近执行时间的任务
    }
     //.......
}
 
 
```

```
public void run() {
        try {
            mainLoop();//无异常捕获
        } finally {
            // Someone killed this Thread, behave as if Timer cancelled
            synchronized(queue) {
                newTasksMayBeScheduled = false;
                queue.clear();  // Eliminate obsolete references
            }
        }
    }
 
 
    /**
     * The main timer loop.  (See class comment.)
     */
    private void mainLoop() {
        while (true) {
            try {
                TimerTask task;
                boolean taskFired;
                synchronized(queue) {
                    // Wait for queue to become non-empty
                    while (queue.isEmpty() && newTasksMayBeScheduled)
                        queue.wait();
                    if (queue.isEmpty())
                        break; // Queue is empty and will forever remain; die
 
 
                    // Queue nonempty; look at first evt and do the right thing
                    long currentTime, executionTime;
                    task = queue.getMin(); //获取任务
                    synchronized(task.lock) {
                        if (task.state == TimerTask.CANCELLED) { //取消泽移除并继续循环
                            queue.removeMin();
                            continue;  // No action required, poll queue again
                        }
                        currentTime = System.currentTimeMillis();
                        executionTime = task.nextExecutionTime;
                        if (taskFired = (executionTime<=currentTime)) { //执行时间到了
                            if (task.period == 0) { // 不是周期任务
                                queue.removeMin(); //移除任务
                                task.state = TimerTask.EXECUTED;//变更任务状态为已执行
                            } else { // 周期任务，更新时间为下次执行时间
                                queue.rescheduleMin(
                                  task.period<0 ? currentTime   - task.period
                                                : executionTime + task.period);
                            }
                        }
                    }
                    if (!taskFired) // 还未到达执行时间等待
                        queue.wait(executionTime - currentTime);
                }
                if (taskFired)  // 执行任务，无异常捕获
                    task.run();
            } catch(InterruptedException e) {
            }
        }
    }
```

现在我们来看下ScheduledThreadPoolExecutor提交一个任务后，整体的执行过程：

提交一个任务后，为了满足ScheduledThreadPoolExecutor能够延时执行任务和能周期执行任务的特性，会先将实现Runnable接口的类转换成ScheduledFutureTask。

然后会调用delayedExecute方法进行执行任务:先将任务放入到队列中，然后调用ensurePrestart方法，新建Worker类（此逻辑为线程池ThreadPoolExecutor实现）

当执行任务时，就会调用被Worker所重写的run方法，进而会继续执行runWorker方法。在runWorker方法中会调用getTask方法从阻塞队列中不断的去获取任务进行执行，直到从阻塞队列中获取的任务为null的话，线程结束终止。(此处逻辑都是线程池ThreadPoolExecutor的实现)

getTask方法会调用队列的poll和take方法，此处就调用到DelayedWorkQueue重写的poll和take逻辑，实现了延迟任务的阻塞

执行任务时，将调用ScheduledFutureTask重载的run方法，实现周期性任务的场景

小结：

ScheduledThreadPoolExecutor继承了ThreadPoolExecutor，通过重写任务、阻塞队列实现了延迟任务调度的实现

ScheduledThreadPoolExecutor大致的流程和Timer差不多，都是通过一个阻塞队列维护任务，能实现单次任务、周期性任务的执行，主要差别在于能多线程运行任务，不会单线程阻塞，并且Java线程池的底层runworker实现了异常的捕获，不会因为一个任务的出错而影响之后的任

在任务队列的维护上，与Timer一样，也是优先队列，插入和删除的时间复杂度是O(logn)

```
//元素必须实现Delayed接口，也实现了阻塞队列public class DelayQueue<E extends Delayed> extends AbstractQueue<E>
    implements BlockingQueue<E> {
 
 
    private final transient ReentrantLock lock = new ReentrantLock();
    private final PriorityQueue<E> q = new PriorityQueue<E>();//优先队列，
    
   public E take() throws InterruptedException {
        final ReentrantLock lock = this.lock;
        lock.lockInterruptibly();
        try {
            for (;;) {
                E first = q.peek();
                if (first == null)
                    available.await();
                else {
                    long delay = first.getDelay(NANOSECONDS);
                    if (delay <= 0) //小于等于0，时间到了
                        return q.poll();
                    first = null; // don't retain ref while waiting
                    if (leader != null)
                        available.await();//没有抢到leader的线程进入等待，避免大量唤醒操作
                    else {
                        Thread thisThread = Thread.currentThread();
                        leader = thisThread;
                        try {
                            available.awaitNanos(delay);//leader线程，在等待一定时间后再次尝试获取
                        } finally {
                            if (leader == thisThread)//重置leader
                                leader = null;
                        }
                    }
                }
            }
        } finally {
            if (leader == null && q.peek() != null)
                available.signal();
            lock.unlock();
        }
    }
    //...
}
//继承了Comparable
public interface Delayed extends Comparable<Delayed> {
 
 
    long getDelay(TimeUnit unit);


```